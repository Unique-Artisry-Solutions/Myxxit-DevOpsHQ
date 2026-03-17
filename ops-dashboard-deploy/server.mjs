import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const publicDir = path.join(__dirname, 'public');
const authPath = path.join(dataDir, 'auth.json');
const statePath = path.join(dataDir, 'state.json');
const PORT = Number(process.env.PORT || 4311);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

fs.mkdirSync(dataDir, { recursive: true });

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return [decodeURIComponent(part.slice(0, i)), decodeURIComponent(part.slice(i + 1))];
  }));
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, contentType) {
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  stream.pipe(res);
}

function getContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function pbkdf2(password, saltHex) {
  return crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 120000, 32, 'sha256').toString('hex');
}

function randomId(prefix = 'id') {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function getSession(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, ...session };
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Authentication required' });
    return null;
  }
  return session;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sanitizeTask(input, existing = null) {
  const now = new Date().toISOString();
  return {
    id: existing?.id || randomId('task'),
    title: String(input.title || '').trim(),
    type: String(input.type || 'task').trim(),
    status: String(input.status || 'proposed').trim(),
    risk: String(input.risk || 'low').trim(),
    branch: String(input.branch || '').trim(),
    owner: String(input.owner || 'Selym').trim(),
    model: String(input.model || '').trim(),
    summary: String(input.summary || '').trim(),
    recommendation: String(input.recommendation || '').trim(),
    approval: String(input.approval || 'pending').trim(),
    notes: String(input.notes || '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function routeApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/login') {
    return readBody(req).then(body => {
      const auth = readJson(authPath, null);
      const username = String(body.username || '');
      const password = String(body.password || '');
      if (!auth || username !== auth.username || pbkdf2(password, auth.salt) !== auth.passwordHash) {
        return sendJson(res, 401, { error: 'Invalid credentials' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { username: auth.username, expiresAt: Date.now() + SESSION_TTL_MS });
      sendJson(res, 200, { ok: true, username: auth.username, mustChangePassword: !!auth.mustChangePassword }, {
        'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
      });
    }).catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const cookies = parseCookies(req);
    if (cookies.session) sessions.delete(cookies.session);
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/session') {
    const session = getSession(req);
    const auth = readJson(authPath, null);
    return sendJson(res, 200, {
      authenticated: !!session,
      username: session?.username || null,
      mustChangePassword: !!auth?.mustChangePassword,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/change-password') {
    const session = requireAuth(req, res);
    if (!session) return;
    return readBody(req).then(body => {
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 12) {
        return sendJson(res, 400, { error: 'New password must be at least 12 characters.' });
      }
      const auth = readJson(authPath, null);
      if (pbkdf2(currentPassword, auth.salt) !== auth.passwordHash) {
        return sendJson(res, 401, { error: 'Current password is incorrect.' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      auth.salt = salt;
      auth.passwordHash = pbkdf2(newPassword, salt);
      auth.mustChangePassword = false;
      auth.updatedAt = new Date().toISOString();
      writeJson(authPath, auth);
      return sendJson(res, 200, { ok: true });
    }).catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    const session = requireAuth(req, res);
    if (!session) return;
    const state = readJson(statePath, { tasks: [] });
    const tasks = [...state.tasks].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return sendJson(res, 200, { tasks });
  }

  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    const session = requireAuth(req, res);
    if (!session) return;
    return readBody(req).then(body => {
      const state = readJson(statePath, { tasks: [] });
      const task = sanitizeTask(body);
      if (!task.title) return sendJson(res, 400, { error: 'Title is required.' });
      state.tasks.push(task);
      writeJson(statePath, state);
      return sendJson(res, 201, { task });
    }).catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/tasks/')) {
    const session = requireAuth(req, res);
    if (!session) return;
    const taskId = url.pathname.split('/').pop();
    return readBody(req).then(body => {
      const state = readJson(statePath, { tasks: [] });
      const index = state.tasks.findIndex(t => t.id === taskId);
      if (index === -1) return sendJson(res, 404, { error: 'Task not found.' });
      const updated = sanitizeTask(body, state.tasks[index]);
      if (!updated.title) return sendJson(res, 400, { error: 'Title is required.' });
      state.tasks[index] = updated;
      writeJson(statePath, state);
      return sendJson(res, 200, { task: updated });
    }).catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/tasks/')) {
    const session = requireAuth(req, res);
    if (!session) return;
    const taskId = url.pathname.split('/').pop();
    const state = readJson(statePath, { tasks: [] });
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    writeJson(statePath, state);
    return sendJson(res, 200, { ok: true });
  }

  return false;
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const handled = routeApi(req, res);
    if (handled !== false) return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(publicDir, 'index.html');
  }
  sendFile(res, filePath, getContentType(filePath));
});

server.listen(PORT, HOST, () => {
  console.log(`Private dev dashboard running on http://${HOST}:${PORT}`);
});
