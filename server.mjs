import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const publicDir = path.join(__dirname, 'public');
const authPath = path.join(dataDir, 'auth.json');
const PORT = Number(process.env.PORT || 4311);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

fs.mkdirSync(dataDir, { recursive: true });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function performSupabaseHealthCheck() {
  return supabase
    .from('tasks')
    .select('id', { head: true, count: 'exact' })
    .limit(1)
    .then(({ error }) => {
      if (error) throw error;
      return {
        supabase: 'ok',
        auth: fs.existsSync(authPath) ? 'present' : 'missing',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
      };
    });
}

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

function getAuth() {
  const fileAuth = readJson(authPath, null);
  if (fileAuth) return { ...fileAuth, source: 'file' };
  const envUser = process.env.AUTH_USERNAME;
  const envSalt = process.env.AUTH_SALT;
  const envHash = process.env.AUTH_PASSWORD_HASH;
  if (envUser && envSalt && envHash) {
    return {
      username: envUser,
      salt: envSalt,
      passwordHash: envHash,
      mustChangePassword: true,
      source: 'env',
    };
  }
  return null;
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

function getPrincipal(req) {
  // 1. Check for API Key
  const authHeader = req.headers.authorization || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
  const apiKey = process.env.API_KEY;
  if (apiKey && tokenMatch && tokenMatch[1] === apiKey) {
    return { username: 'Selym-API', source: 'apiKey' };
  }

  // 2. Fallback to session cookie
  const token = parseCookies(req).session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { ...session, source: 'session' };
}

function requireAuth(req, res) {
  const principal = getPrincipal(req);
  if (!principal) {
    sendJson(res, 401, { error: 'Authentication required' });
    return null;
  }
  return principal;
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
function sanitizeTask(input = {}) {
const clampProgress = (value) => {
if (value === '' || value === null || value === undefined) return 0;
const num = Number(value);
if (Number.isNaN(num)) return 0;
return Math.max(0, Math.min(100, Math.round(num)));
};
const targetRepo = String(input.target_repo || input.targetRepo || '').trim();
const allowedPathsRaw = input.allowed_paths || input.allowedPaths || '';
const allowedPaths = Array.isArray(allowedPathsRaw)
? allowedPathsRaw.map(v => String(v || '').trim()).filter(Boolean)
: String(allowedPathsRaw).split(',').map(v => v.trim()).filter(Boolean);
const branch = String(input.branch || '').trim();
const status = String(input.status || 'proposed').trim() || 'proposed';

if (!targetRepo) throw new Error('Target repo is required.');
if (!['the-drinx-app', 'Myxxit-DevOpsHQ'].includes(targetRepo)) {
throw new Error('Target repo must be either the-drinx-app or Myxxit-DevOpsHQ.');
}
if (!allowedPaths.length) throw new Error('Allowed paths are required.');
if (targetRepo === 'the-drinx-app' && branch && !branch.startsWith('app/')) {
throw new Error('Main app branches must use the app/ prefix.');
}
if (targetRepo === 'Myxxit-DevOpsHQ' && branch && !branch.startsWith('hq/')) {
throw new Error('DevOps HQ branches must use the hq/ prefix.');
}

return {
title: String(input.title || '').trim(),
type: String(input.type || 'task').trim() || 'task',
status,
risk: String(input.risk || 'low').trim() || 'low',
branch,
target_repo: targetRepo,
allowed_paths: allowedPaths,
owner: String(input.owner || 'Selym').trim() || 'Selym',
model: String(input.model || '').trim(),
summary: String(input.summary || '').trim(),
recommendation: String(input.recommendation || '').trim(),
approval: String(input.approval || 'pending').trim() || 'pending',
notes: String(input.notes || '').trim(),
progress: clampProgress(input.progress),
};
}
function mapTaskRow(row = {}, events = []) {
const createdAt = row.created_at || row.createdAt || row.createdat || null;
const updatedAt = row.updated_at || row.updatedAt || row.updatedat || createdAt || null;
const progressValue = Number(row.progress);
return {
id: row.id,
title: row.title || '',
type: row.type || 'task',
status: row.status || 'proposed',
risk: row.risk || 'low',
branch: row.branch || '',
targetRepo: row.target_repo || row.targetRepo || '',
allowedPaths: row.allowed_paths || row.allowedPaths || [],
owner: row.owner || 'Selym',
model: row.model || '',
summary: row.summary || '',
recommendation: row.recommendation || '',
approval: row.approval || 'pending',
notes: row.notes || '',
progress: Number.isFinite(progressValue) ? Math.max(0, Math.min(100, Math.round(progressValue))) : 0,
createdAt,
updatedAt: updatedAt || createdAt,
events,
};
}

function mapEventRow(row = {}) {
  return {
    id: row.id,
    taskId: row.task_id || row.taskId,
    type: row.event_type || row.type || 'progress',
    detail: row.detail || row.description || '',
    metadata: row.metadata || null,
    createdAt: row.created_at || row.createdAt || null,
  };
}

function mapRosterRow(row = {}) {
  const laneOrderRaw = Number(row.lane_order ?? row.laneOrder ?? 0);
  return {
    id: row.id,
    lane: row.lane || 'core',
    laneOrder: Number.isFinite(laneOrderRaw) ? laneOrderRaw : 0,
    displayName: row.display_name || row.displayName || '',
    role: row.role_label || row.role || '',
    responsibility: row.primary_responsibility || row.responsibility || '',
    defaultModel: row.default_model || row.defaultModel || '',
    fallbackModel: row.fallback_model || row.fallbackModel || '',
    reviewModel: row.review_model || row.reviewModel || '',
    postingMode: row.posting_mode || row.postingMode || '',
    updateFormat: row.update_format || row.updateFormat || '',
    approval: row.approval_required || row.approval || '',
    notes: row.notes || '',
    active: typeof row.active === 'boolean' ? row.active : true,
  };
}

async function fetchTasksWithEvents() {
  const { data: taskRows, error } = await supabase.from('tasks').select('*');
  if (error) throw new Error(`Failed to load tasks: ${error.message}`);
  const tasks = (taskRows || []).map(row => mapTaskRow(row));
  const ids = tasks.map(t => t.id).filter(Boolean);
  let eventsByTask = {};
  if (ids.length) {
    const { data: eventRows, error: eventError } = await supabase
      .from('task_events')
      .select('*')
      .in('task_id', ids);
    if (eventError) throw new Error(`Failed to load task events: ${eventError.message}`);
    for (const row of eventRows || []) {
      const event = mapEventRow(row);
      if (!event.taskId) continue;
      (eventsByTask[event.taskId] ||= []).push(event);
    }
    Object.values(eventsByTask).forEach(list => list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
  }
  return tasks
    .map(task => ({ ...task, events: eventsByTask[task.id] || [] }))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

async function fetchRosterEntries() {
  const { data, error } = await supabase
    .from('roster_entries')
    .select('*')
    .order('lane_order', { ascending: true })
    .order('display_name', { ascending: true });
  if (error) throw new Error(`Failed to load roster: ${error.message}`);
  return (data || []).map(row => mapRosterRow(row));
}

async function createTaskRecord(input, actor) {
const sanitized = sanitizeTask(input);
if (!sanitized.title) throw new Error('Title is required.');
const insertPayload = { ...sanitized };
const { data, error } = await supabase.from('tasks').insert(insertPayload).select().single();
if (error) throw new Error(`Failed to create task: ${error.message}`);
const task = mapTaskRow(data);
await recordTaskEvent(task.id, {
type: 'created',
detail: `${actor || 'system'} created this task.`,
metadata: { actor: actor || 'system' },
}).catch(() => {});
return task;
}

async function updateTaskRecord(taskId, input, actor) {
const sanitized = sanitizeTask(input);
if (!sanitized.title) throw new Error('Title is required.');
const { data, error } = await supabase.from('tasks').update(sanitized).eq('id', taskId).select().single();
if (error) throw new Error(`Failed to update task: ${error.message}`);
const task = mapTaskRow(data);
await recordTaskEvent(task.id, {
type: 'updated',
detail: `${actor || 'system'} updated the task.`,
metadata: { actor: actor || 'system' },
}).catch(() => {});
return task;
}

async function deleteTaskRecord(taskId) {
const { error } = await supabase.from('tasks').delete().eq('id', taskId);
if (error) throw new Error(`Failed to delete task: ${error.message}`);
}

async function getTaskRecord(taskId) {
const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).single();
if (error) throw new Error(`Failed to load task: ${error.message}`);
return mapTaskRow(data);
}

async function recordTaskEvent(taskId, { type = 'progress', detail = '', metadata = null } = {}) {
  const cleanDetail = String(detail || '').trim();
  if (!taskId || !cleanDetail) return null;

  const actor =
    metadata && typeof metadata === 'object' && metadata.actor
      ? String(metadata.actor)
      : 'system';

  const payload = {
    task_id: taskId,
    event_type: type,
    actor,
    details: {
      detail: cleanDetail,
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    },
  };

  const { data, error } = await supabase.from('task_events').insert(payload).select().single();
  if (error) throw new Error(`Failed to record task event: ${error.message}`);
  return mapEventRow(data);
}
async function createManualTaskEvent(taskId, body, actor) {
if (!taskId) throw new Error('Task ID is required.');
const detail = String(body.detail || body.description || '').trim();
const type = String(body.type || 'progress').trim() || 'progress';
if (!detail) throw new Error('Detail is required.');
return recordTaskEvent(taskId, {
type,
detail,
metadata: { actor: actor || 'system' },
});
}

async function approveTask(taskId, body, actor) {
  const task = await getTaskRecord(taskId);
  if (task.approval === 'approved' && ['approved', 'completed'].includes(task.status)) {
    return task;
  }
  const detailNote = String(body?.note || '').trim();
  const patch = {
    approval: 'approved',
    status: ['in-progress', 'completed'].includes(task.status) ? task.status : 'approved',
  };
  if (task.progress < 25) patch.progress = 25;
  return transitionTask(
    taskId,
    patch,
    actor,
    `${actor || 'system'} approved this task.${detailNote ? ` Note: ${detailNote}` : ''}`.trim(),
    'approval'
  );
}

async function beginDevelopment(taskId, body, actor) {
  const task = await getTaskRecord(taskId);
  if (['in-progress', 'completed'].includes(task.status)) {
    return task;
  }
  const detailNote = String(body?.note || '').trim();
  const patch = {
    status: 'in-progress',
    approval: task.approval,
    progress: task.progress < 10 ? 10 : task.progress,
  };
  return transitionTask(
    taskId,
    patch,
    actor,
    `${actor || 'system'} began development on this task.${detailNote ? ` Note: ${detailNote}` : ''}`.trim(),
    'status-change'
  );
}

function routeApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/login') {
    return readBody(req).then(body => {
      const auth = getAuth();
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
    const principal = getPrincipal(req);
    const auth = getAuth();
    return sendJson(res, 200, {
      authenticated: !!principal,
      username: principal?.username || null,
      mustChangePassword: !!auth?.mustChangePassword,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/change-password') {
    const principal = requireAuth(req, res);
    if (!principal) return;
    return readBody(req).then(body => {
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 12) {
        return sendJson(res, 400, { error: 'New password must be at least 12 characters.' });
      }
      const auth = getAuth();
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

  if (req.method === 'GET' && url.pathname === '/api/roster') {
    const principal = requireAuth(req, res);
    if (!principal) return;
    return fetchRosterEntries()
      .then(roster => sendJson(res, 200, { roster }))
      .catch(err => sendJson(res, 500, { error: err.message }));
  }

  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    const principal = requireAuth(req, res);
    if (!principal) return;
    return fetchTasksWithEvents()
      .then(tasks => sendJson(res, 200, { tasks }))
      .catch(err => sendJson(res, 500, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    const principal = requireAuth(req, res);
    if (!principal) return;
    return readBody(req)
      .then(body => createTaskRecord(body, principal.username))
      .then(task => sendJson(res, 201, { task }))
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/tasks/')) {
    const principal = requireAuth(req, res);
    if (!principal) return;
    const taskId = url.pathname.split('/').pop();
    return readBody(req)
      .then(body => updateTaskRecord(taskId, body, principal.username))
      .then(task => sendJson(res, 200, { task }))
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/tasks/')) {
    const principal = requireAuth(req, res);
    if (!principal) return;
    const taskId = url.pathname.split('/').pop();
    return deleteTaskRecord(taskId)
      .then(() => sendJson(res, 200, { ok: true }))
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/events')) {
    const principal = requireAuth(req, res);
    if (!principal) return;
    const segments = url.pathname.split('/');
    const taskId = segments.at(-2);
    return readBody(req)
      .then(body => createManualTaskEvent(taskId, body, principal.username))
      .then(event => sendJson(res, 201, { event }))
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/approve')) {
    const principal = requireAuth(req, res);
    if (!principal) return;
    const segments = url.pathname.split('/');
    const taskId = segments.at(-2);
    return readBody(req).catch(() => ({}))
      .then(body => approveTask(taskId, body, principal.username))
      .then(task => sendJson(res, 200, { task }))
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/begin')) {
    const principal = requireAuth(req, res);
    if (!principal) return;
    const segments = url.pathname.split('/');
    const taskId = segments.at(-2);
    return readBody(req).catch(() => ({}))
      .then(body => beginDevelopment(taskId, body, principal.username))
      .then(task => sendJson(res, 200, { task }))
      .catch(err => sendJson(res, 400, { error: err.message }));
  }

  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return performSupabaseHealthCheck()
      .then(payload => sendJson(res, 200, { ok: true, ...payload }))
      .catch(err => sendJson(res, 503, { ok: false, error: err.message }));
  }

  if (req.url.startsWith('/api/')) {
    const handled = routeApi(req, res);
    if (handled !== false) return;
  }

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
