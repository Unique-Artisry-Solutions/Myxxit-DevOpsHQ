# API Key Authentication for DevOps HQ

## Overview

DevOps HQ server now supports secure API Key authentication via Bearer tokens, enabling programmatic access for automation workflows and CI/CD integration.

## Configuration

### Setting the API Key

The API key must be provided via the `API_KEY` environment variable:

```bash
export API_KEY="your-secure-api-key-here"
```

**In production/deployment:**
- Set via environment variable in Render, Docker, or deployment platform
- Use strong, randomly generated keys (minimum 32 characters recommended)
- Never commit API keys to version control
- Rotate periodically for security

## Usage

### Authentication Header

Send requests with the Authorization header using Bearer token scheme:

```bash
Authorization: Bearer <API_KEY>
```

### Example: Fetch Tasks

```bash
curl -H "Authorization: Bearer your-api-key" \
  https://hq.myxxit.dev/api/tasks
```

### Example: Create Task

```bash
curl -X POST \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Enable feature X",
    "type": "task",
    "branch": "hq/feature-x",
    "target_repo": "Myxxit-DevOpsHQ",
    "allowed_paths": ["ops-dashboard/"],
    "status": "proposed",
    "risk": "low"
  }' \
  https://hq.myxxit.dev/api/tasks
```

### Example: Approve Task

```bash
curl -X POST \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"note": "Approved by automation"}' \
  https://hq.myxxit.dev/api/tasks/<task-id>/approve
```

## Authentication Flow

1. **API Key Check (Priority 1)**
   - Extract Bearer token from `Authorization` header
   - Compare against `API_KEY` environment variable
   - If valid: Return principal `{ username: 'Selym-API', source: 'apiKey' }`

2. **Session Cookie Fallback (Priority 2)**
   - Check for `session` cookie
   - Validate against in-memory sessions map
   - Check expiration (12-hour TTL)
   - If valid: Return user principal from session

3. **Unauthorized**
   - If neither auth method succeeds: Return 401 Unauthorized

## Security Considerations

### Bearer Token Format

- **Valid:** `Authorization: Bearer abc123def456`
- **Invalid:** `Authorization: Bearer token` (parsed as single token string)
- **Invalid:** `Authorization: Basic abc123` (wrong scheme)
- **Regex:** `/^Bearer\s+(.+)$/` (one or more characters after "Bearer ")

### Best Practices

1. **Key Storage**
   - Use environment variable management (Render, GitHub Secrets, etc.)
   - Never expose in logs or error responses
   - Rotate keys periodically

2. **Transport Security**
   - Always use HTTPS in production
   - Bearer tokens are equivalent to passwords

3. **Scope & Limits**
   - API keys grant full access (same as logged-in user)
   - Consider separate dedicated API keys for different automation workflows
   - Monitor API key usage patterns

4. **Fallback**
   - Session authentication remains available as fallback
   - Useful for manual web UI access
   - Can be combined with API key for robust deployments

## Protected Endpoints

All `/api/*` endpoints require authentication:

- `GET /api/tasks` — List all tasks
- `POST /api/tasks` — Create task
- `PUT /api/tasks/:id` — Update task
- `DELETE /api/tasks/:id` — Delete task
- `POST /api/tasks/:id/approve` — Approve task
- `POST /api/tasks/:id/begin` — Begin development
- `POST /api/tasks/:id/events` — Add task event
- `GET /api/roster` — List roster entries
- `POST /api/change-password` — Change password

**Public endpoints (no auth required):**
- `GET /healthz` — Health check
- `GET /` — Dashboard UI (serves static files)

## Testing

Run the included test to validate Bearer token logic:

```bash
node test-api-key.mjs
```

## Implementation Notes

- Bearer token validation uses regex `/^Bearer\s+(.+)$/`
- API key comparison is constant-time safe (string comparison)
- Authenticated requests are logged with principal source (`apiKey` or `session`)
- Session TTL is 12 hours, refreshed on each request
