import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = 4311;
const DATA_DIR = '/opt/myxxit-ops-dashboard/data';
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const sessions = new Map();
const TTL = 1000 * 60 * 60 * 12;

fs.mkdirSync(DATA_DIR, { recursive: true });

function pbkdf2(password, saltHex) {
  return crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 120000, 32, 'sha256').toString('hex');
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
if (!fs.existsSync(AUTH_FILE)) {
  writeJson(AUTH_FILE, {
    username: 'travis',
    salt: '68c4d7552feb6156bb15c2cf39db9410',
    passwordHash: 'caa89cd56332e31cd739c451c0097251014522271c343fc90e3fad90e851d61a',
    mustChangePassword: true,
    updatedAt: new Date().toISOString()
  });
}
if (!fs.existsSync(TASKS_FILE)) {
  writeJson(TASKS_FILE, { tasks: [] });
}
function cookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [decodeURIComponent(v.slice(0, i)), decodeURIComponent(v.slice(i + 1))];
  }));
}
function getSession(req) {
  const token = cookies(req).session;
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(token); return null; }
  s.expiresAt = Date.now() + TTL;
  return s;
}
function send(res, code, body, type='text/html; charset=utf-8', headers={}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function json(res, code, obj, headers={}) {
  send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8', headers);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
const page = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Myxxit Dev Ops Dashboard</title><style>:root {
  --bg: #08101c;
  --bg-2: #10192a;
  --panel: rgba(14, 22, 37, 0.8);
  --panel-strong: rgba(19, 31, 51, 0.92);
  --panel-soft: rgba(255, 255, 255, 0.04);
  --text: #f5f7ff;
  --muted: #99a7c2;
  --muted-2: #7d8ba7;
  --accent: #7c8cff;
  --accent-2: #4fd1c5;
  --good: #22c55e;
  --warn: #f59e0b;
  --bad: #ef4444;
  --border: rgba(255, 255, 255, 0.08);
  --shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
}

* { box-sizing: border-box; }
html { color-scheme: dark; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at 15% 20%, rgba(124, 140, 255, 0.22), transparent 26%),
    radial-gradient(circle at 80% 0%, rgba(79, 209, 197, 0.16), transparent 24%),
    radial-gradient(circle at 80% 60%, rgba(124, 140, 255, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(8, 16, 28, 0.96), rgba(7, 12, 22, 1)),
    repeating-linear-gradient(135deg, rgba(255,255,255,0.014) 0 2px, transparent 2px 14px);
}
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,0.025), transparent 20%, transparent 80%, rgba(255,255,255,0.02));
  mix-blend-mode: soft-light;
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px;
}

.grid { display: grid; gap: 18px; }
.grid.two { grid-template-columns: 420px minmax(0, 1fr); }
.grid.stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }

.card {
  position: relative;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 22px;
  padding: 22px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent 25%);
}
.card > * { position: relative; z-index: 1; }
.card.soft { background: var(--panel-soft); }

.hero {
  display: grid;
  gap: 18px;
  grid-template-columns: 1.3fr auto;
  align-items: start;
}
.hero-copy h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.02;
  letter-spacing: -0.03em;
}
.hero-copy p {
  margin: 10px 0 0;
  color: var(--muted);
  max-width: 760px;
  line-height: 1.55;
}
.hero-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 999px;
  color: #dce4ff;
  border: 1px solid rgba(124,140,255,0.2);
  background: rgba(124,140,255,0.12);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

h2, h3 { margin: 0; letter-spacing: -0.02em; }
label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: #d7e0f6;
  letter-spacing: 0.02em;
}
input, select, textarea, button {
  font: inherit;
  border-radius: 14px;
}
input, select, textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.045);
  color: var(--text);
  border: 1px solid rgba(255,255,255,0.08);
  padding: 13px 14px;
  outline: none;
  transition: 160ms ease;
}
input:focus, select:focus, textarea:focus {
  border-color: rgba(124, 140, 255, 0.7);
  box-shadow: 0 0 0 4px rgba(124, 140, 255, 0.14);
}
textarea {
  min-height: 110px;
  resize: vertical;
}
button {
  border: 0;
  background: linear-gradient(135deg, var(--accent), #6572ff);
  color: white;
  padding: 12px 16px;
  cursor: pointer;
  font-weight: 650;
  transition: transform 120ms ease, opacity 120ms ease, box-shadow 160ms ease;
  box-shadow: 0 10px 30px rgba(92, 112, 255, 0.24);
}
button:hover { transform: translateY(-1px); }
button.secondary {
  background: rgba(255,255,255,0.08);
  color: var(--text);
  box-shadow: none;
}
button.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 10px 30px rgba(239, 68, 68, 0.2);
}
button.ghost {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.12);
  color: #dfe6ff;
  box-shadow: none;
}

.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.row { display: flex; gap: 12px; }
.row > * { flex: 1; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.header h2 { font-size: 22px; }
.muted { color: var(--muted); }
.muted-2 { color: var(--muted-2); }
.small { font-size: 13px; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 12px;
  color: #d7dcff;
}
.badge.dot::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.95;
}
.badge.good { color: #7cf2a3; }
.badge.warn { color: #ffd27c; }
.badge.bad { color: #ff9595; }
.badge.accent { color: #bec7ff; }

.notice {
  margin-top: 14px;
  padding: 13px 14px;
  border-radius: 14px;
  background: rgba(124, 140, 255, 0.12);
  border: 1px solid rgba(124, 140, 255, 0.28);
}

.stat {
  display: grid;
  gap: 6px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(255,255,255,0.06);
}
.stat .value {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.stat .label {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.task-list { display: grid; gap: 14px; }
.task {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  padding: 18px;
  background: rgba(255,255,255,0.03);
  transition: border-color 150ms ease, transform 150ms ease, background 150ms ease;
}
.task:hover {
  transform: translateY(-1px);
  border-color: rgba(124,140,255,0.28);
  background: rgba(255,255,255,0.045);
}
.task-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.task h3 {
  font-size: 18px;
  margin-bottom: 6px;
}
.task p {
  margin: 10px 0 0;
  line-height: 1.55;
  color: #e7ecff;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0;
}
.task-footer {
  margin-top: 14px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.task-copy {
  display: grid;
  gap: 8px;
}
.task-empty {
  padding: 22px;
  border-radius: 18px;
  border: 1px dashed rgba(255,255,255,0.12);
  color: var(--muted);
  text-align: center;
}

.auth-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
}
.auth-card {
  width: min(520px, 100%);
}
.auth-card h1 {
  font-size: 34px;
  margin: 0;
  letter-spacing: -0.03em;
}
.auth-card .subtitle {
  margin: 12px 0 0;
  color: var(--muted);
  line-height: 1.55;
}

.helper-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 16px;
}
.helper-panel {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}
.helper-panel strong {
  display: block;
  margin-bottom: 6px;
}

.form-shell {
  display: grid;
  gap: 16px;
}
.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

hr {
  border: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
  margin: 10px 0;
}

@media (max-width: 1080px) {
  .grid.two,
  .grid.stats,
  .helper-grid,
  .hero {
    grid-template-columns: 1fr;
  }
  .hero-actions { justify-content: flex-start; }
}

@media (max-width: 720px) {
  .container { padding: 18px; }
  .row { flex-direction: column; }
  .task-top, .task-footer, .header { flex-direction: column; }
  .actions { width: 100%; }
  .actions button { flex: 1 1 auto; }
}
</style></head><body><div id="app"></div><script>const app = document.getElementById('app');
let session = null;
let tasks = [];
let editingId = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function titleCase(value = '') {
  return String(value)
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function badgeTone(kind, value) {
  const v = String(value || '').toLowerCase();
  if (kind === 'risk') {
    if (v === 'high') return 'bad';
    if (v === 'medium') return 'warn';
    return 'good';
  }
  if (kind === 'approval') {
    if (v === 'approved') return 'good';
    if (v === 'rejected') return 'bad';
    return 'warn';
  }
  if (kind === 'status') {
    if (['completed', 'approved'].includes(v)) return 'good';
    if (['blocked', 'rejected'].includes(v)) return 'bad';
    if (['waiting-approval', 'in-progress'].includes(v)) return 'warn';
  }
  return 'accent';
}

function stats() {
  const pending = tasks.filter(t => t.approval === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const highRisk = tasks.filter(t => t.risk === 'high').length;
  return { pending, inProgress, completed, highRisk };
}

function renderLogin(error = '') {
  app.innerHTML = \`
    <div class="auth-shell">
      <div class="card auth-card">
        <div class="hero-kicker">Private Internal Surface</div>
        <h1>Myxxit Ops HQ</h1>
        <p class="subtitle">Track active work, proposed changes, branch-level implementation, and approval decisions without losing the thread in chat.</p>

        <div class="helper-grid">
          <div class="helper-panel">
            <strong>What it is</strong>
            <div class="muted small">A private operating dashboard for Myxxit development, approvals, and task memory.</div>
          </div>
          <div class="helper-panel">
            <strong>What it is not</strong>
            <div class="muted small">Not Jira, not bloat, not a corporate sadness machine.</div>
          </div>
        </div>

        <form id="loginForm" class="grid" style="margin-top:18px;">
          <div>
            <label>Username</label>
            <input name="username" placeholder="travis" value="travis" required />
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" required />
          </div>
          <button type="submit">Enter dashboard</button>
          ${error ? \`<div class="notice">${esc(error)}</div>\` : ''}
        </form>
      </div>
    </div>\`;

  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      session = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      await load();
    } catch (err) {
      renderLogin(err.message);
    }
  };
}

function taskCard(task) {
  return \`
    <div class="task">
      <div class="task-top">
        <div class="task-copy">
          <h3>${esc(task.title)}</h3>
          <div class="small muted">${esc(task.owner)} · ${esc(task.type)} · updated ${new Date(task.updatedAt).toLocaleString()}</div>
          <div class="meta">
            <span class="badge dot ${badgeTone('status', task.status)}">${esc(titleCase(task.status))}</span>
            <span class="badge dot ${badgeTone('risk', task.risk)}">Risk: ${esc(titleCase(task.risk))}</span>
            <span class="badge dot ${badgeTone('approval', task.approval)}">Approval: ${esc(titleCase(task.approval))}</span>
            ${task.branch ? \`<span class="badge accent">${esc(task.branch)}</span>\` : ''}
            ${task.model ? \`<span class="badge accent">${esc(task.model)}</span>\` : ''}
          </div>
        </div>
        <div class="actions">
          <button class="ghost" onclick="startEdit('${task.id}')">Edit</button>
          <button class="danger" onclick="removeTask('${task.id}')">Delete</button>
        </div>
      </div>

      ${task.summary ? \`<p><strong>Summary:</strong> ${esc(task.summary)}</p>\` : ''}
      ${task.recommendation ? \`<p><strong>Recommendation:</strong> ${esc(task.recommendation)}</p>\` : ''}
      ${task.notes ? \`<p><strong>Notes:</strong> ${esc(task.notes)}</p>\` : ''}
    </div>\`;
}

function renderDashboard(message = '') {
  const current = tasks.find(t => t.id === editingId);
  const s = stats();

  app.innerHTML = \`
    <div class="container grid">
      <div class="card">
        <div class="hero">
          <div class="hero-copy">
            <div class="hero-kicker">Myxxit Internal Control Surface</div>
            <h1>Ops dashboard for work, approvals, and proposed changes</h1>
            <p>Use this to track what is active, what is risky, what is waiting on Travis, and what should not quietly disappear into chat scrollback.</p>
          </div>
          <div class="hero-actions">
            <span class="badge accent">signed in as ${esc(session.username || 'travis')}</span>
            <button class="secondary" id="passwordBtn">Change password</button>
            <button class="ghost" id="logoutBtn">Logout</button>
          </div>
        </div>

        <div class="grid stats" style="margin-top:18px;">
          <div class="stat">
            <div class="label">Pending approval</div>
            <div class="value">${s.pending}</div>
            <div class="muted small">Waiting on a yes or no</div>
          </div>
          <div class="stat">
            <div class="label">In progress</div>
            <div class="value">${s.inProgress}</div>
            <div class="muted small">Active work underway</div>
          </div>
          <div class="stat">
            <div class="label">Completed</div>
            <div class="value">${s.completed}</div>
            <div class="muted small">Finished or locked in</div>
          </div>
          <div class="stat">
            <div class="label">High risk</div>
            <div class="value">${s.highRisk}</div>
            <div class="muted small">Needs careful review</div>
          </div>
        </div>

        ${session.mustChangePassword ? '<div class="notice">Security note: change the temporary password now.</div>' : ''}
        ${message ? \`<div class="notice">${esc(message)}</div>\` : ''}
      </div>

      <div class="grid two">
        <div class="card">
          <div class="section-title">
            <div>
              <h2>${current ? 'Edit tracked item' : 'Create tracked item'}</h2>
              <div class="muted small">Log actual work, proposed changes, review items, and branch-level status.</div>
            </div>
            ${current ? '<span class="badge warn">Editing mode</span>' : '<span class="badge accent">New entry</span>'}
          </div>

          <form id="taskForm" class="form-shell">
            <div>
              <label>Title</label>
              <input name="title" value="${esc(current?.title || '')}" placeholder="Refactor route protection" required />
            </div>

            <div class="row">
              <div>
                <label>Type</label>
                <input name="type" value="${esc(current?.type || 'task')}" placeholder="task / audit / policy / setup" />
              </div>
              <div>
                <label>Status</label>
                <select name="status">
                  ${['proposed','in-progress','waiting-approval','approved','blocked','completed'].map(v => \`<option ${current?.status===v?'selected':''}>${v}</option>\`).join('')}
                </select>
              </div>
            </div>

            <div class="row">
              <div>
                <label>Risk</label>
                <select name="risk">
                  ${['low','medium','high'].map(v => \`<option ${current?.risk===v?'selected':''}>${v}</option>\`).join('')}
                </select>
              </div>
              <div>
                <label>Approval</label>
                <select name="approval">
                  ${['pending','approved','rejected'].map(v => \`<option ${current?.approval===v?'selected':''}>${v}</option>\`).join('')}
                </select>
              </div>
            </div>

            <div class="row">
              <div>
                <label>Branch</label>
                <input name="branch" value="${esc(current?.branch || '')}" placeholder="dev/example-task" />
              </div>
              <div>
                <label>Owner</label>
                <input name="owner" value="${esc(current?.owner || 'Selym')}" />
              </div>
            </div>

            <div>
              <label>Model</label>
              <input name="model" value="${esc(current?.model || '')}" placeholder="openai/gpt-5.1-codex" />
            </div>

            <div>
              <label>Summary</label>
              <textarea name="summary" placeholder="What changed or what is being proposed?">${esc(current?.summary || '')}</textarea>
            </div>

            <div>
              <label>Recommendation</label>
              <textarea name="recommendation" placeholder="What should happen next?">${esc(current?.recommendation || '')}</textarea>
            </div>

            <div>
              <label>Notes</label>
              <textarea name="notes" placeholder="Context, caveats, or approval notes">${esc(current?.notes || '')}</textarea>
            </div>

            <div class="form-footer">
              <div class="muted small">Keep entries tight. This should help us think, not bury us in admin sludge.</div>
              <div class="actions">
                ${current ? '<button type="button" class="ghost" id="cancelEdit">Cancel</button>' : ''}
                <button type="submit">${current ? 'Save changes' : 'Create item'}</button>
              </div>
            </div>
          </form>
        </div>

        <div class="card">
          <div class="section-title">
            <div>
              <h2>Tracked work</h2>
              <div class="muted small">What exists, what is risky, and what is waiting for a decision.</div>
            </div>
            <span class="badge accent">${tasks.length} items</span>
          </div>

          <div class="task-list">
            ${tasks.length ? tasks.map(taskCard).join('') : '<div class="task-empty">No tracked items yet. Add the first real work item and start using this like an ops surface, not a graveyard.</div>'}
          </div>
        </div>
      </div>
    </div>\`;

  document.getElementById('logoutBtn').onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    session = null;
    renderLogin();
  };
  document.getElementById('passwordBtn').onclick = renderPasswordForm;
  document.getElementById('taskForm').onsubmit = saveTask;
  const cancel = document.getElementById('cancelEdit');
  if (cancel) cancel.onclick = () => { editingId = null; renderDashboard(); };
}

function renderPasswordForm(message = '', error = '') {
  app.innerHTML = \`
    <div class="auth-shell">
      <div class="card auth-card">
        <div class="hero-kicker">Security</div>
        <h1>Change dashboard password</h1>
        <p class="subtitle">Set a new password for the private dashboard. Minimum 12 characters. Make it one you’ll remember without making it idiot bait.</p>
        ${message ? \`<div class="notice">${esc(message)}</div>\` : ''}
        ${error ? \`<div class="notice">${esc(error)}</div>\` : ''}
        <form id="passwordForm" class="grid" style="margin-top:18px;">
          <div><label>Current password</label><input name="currentPassword" type="password" required /></div>
          <div><label>New password</label><input name="newPassword" type="password" minlength="12" required /></div>
          <div class="actions">
            <button type="submit">Update password</button>
            <button type="button" class="ghost" id="backBtn">Back</button>
          </div>
        </form>
      </div>
    </div>\`;

  document.getElementById('backBtn').onclick = () => renderDashboard();
  document.getElementById('passwordForm').onsubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api('/api/change-password', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      session.mustChangePassword = false;
      renderDashboard('Password updated successfully.');
    } catch (err) {
      renderPasswordForm('', err.message);
    }
  };
}

async function saveTask(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  try {
    if (editingId) {
      await api(\`/api/tasks/${editingId}\`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    }
    editingId = null;
    await load('Item saved.');
  } catch (err) {
    renderDashboard(err.message);
  }
}

window.startEdit = function(id) {
  editingId = id;
  renderDashboard();
};

window.removeTask = async function(id) {
  if (!confirm('Delete this item?')) return;
  await api(\`/api/tasks/${id}\`, { method: 'DELETE' });
  if (editingId === id) editingId = null;
  await load('Item deleted.');
};

async function load(message = '') {
  const sessionData = await api('/api/session');
  if (!sessionData.authenticated) return renderLogin();
  session = sessionData;
  const taskData = await api('/api/tasks');
  tasks = taskData.tasks;
  renderDashboard(message);
}

load().catch(() => renderLogin());
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page);
  if (req.method === 'GET' && url.pathname === '/api/session') {
    const s = getSession(req), auth = readJson(AUTH_FILE, null);
    return json(res, 200, { authenticated: !!s, username: s?.username || null, mustChangePassword: !!auth?.mustChangePassword });
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(req).catch(() => ({}));
    const auth = readJson(AUTH_FILE, null);
    if (!auth || body.username !== auth.username || pbkdf2(String(body.password || ''), auth.salt) !== auth.passwordHash) {
      return json(res, 401, { error: 'Invalid credentials' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { username: auth.username, expiresAt: Date.now() + TTL });
    return json(res, 200, { ok: true, username: auth.username, mustChangePassword: !!auth.mustChangePassword }, { 'Set-Cookie': 'session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + (TTL/1000) });
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = cookies(req).session; if (token) sessions.delete(token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (req.method === 'POST' && url.pathname === '/api/change-password') {
    const s = getSession(req); if (!s) return json(res, 401, { error: 'Authentication required' });
    const body = await readBody(req).catch(() => ({}));
    const auth = readJson(AUTH_FILE, null);
    if (pbkdf2(String(body.currentPassword || ''), auth.salt) !== auth.passwordHash) return json(res, 401, { error: 'Current password is incorrect.' });
    if (String(body.newPassword || '').length < 12) return json(res, 400, { error: 'New password must be at least 12 characters.' });
    const salt = crypto.randomBytes(16).toString('hex');
    auth.salt = salt;
    auth.passwordHash = pbkdf2(String(body.newPassword), salt);
    auth.mustChangePassword = false;
    auth.updatedAt = new Date().toISOString();
    writeJson(AUTH_FILE, auth);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    const s = getSession(req); if (!s) return json(res, 401, { error: 'Authentication required' });
    return json(res, 200, readJson(TASKS_FILE, { tasks: [] }));
  }
  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    const s = getSession(req); if (!s) return json(res, 401, { error: 'Authentication required' });
    const body = await readBody(req).catch(() => ({}));
    const store = readJson(TASKS_FILE, { tasks: [] });
    const now = new Date().toISOString();
    const task = {
      id: 'task-' + crypto.randomBytes(5).toString('hex'),
      title: String(body.title || '').trim(),
      type: String(body.type || 'task').trim(),
      status: String(body.status || 'proposed').trim(),
      risk: String(body.risk || 'low').trim(),
      branch: String(body.branch || '').trim(),
      owner: String(body.owner || 'Selym').trim(),
      model: String(body.model || '').trim(),
      summary: String(body.summary || '').trim(),
      recommendation: String(body.recommendation || '').trim(),
      approval: String(body.approval || 'pending').trim(),
      notes: String(body.notes || '').trim(),
      createdAt: now,
      updatedAt: now
    };
    if (!task.title) return json(res, 400, { error: 'Title is required.' });
    store.tasks.unshift(task);
    writeJson(TASKS_FILE, store);
    return json(res, 201, { task });
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/api/tasks/')) {
    const s = getSession(req); if (!s) return json(res, 401, { error: 'Authentication required' });
    const id = url.pathname.split('/').pop();
    const body = await readBody(req).catch(() => ({}));
    const store = readJson(TASKS_FILE, { tasks: [] });
    const i = store.tasks.findIndex(t => t.id === id);
    if (i === -1) return json(res, 404, { error: 'Task not found.' });
    const prev = store.tasks[i];
    const now = new Date().toISOString();
    store.tasks[i] = { ...prev, ...body, id: prev.id, createdAt: prev.createdAt, updatedAt: now };
    if (!String(store.tasks[i].title || '').trim()) return json(res, 400, { error: 'Title is required.' });
    writeJson(TASKS_FILE, store);
    return json(res, 200, { task: store.tasks[i] });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/tasks/')) {
    const s = getSession(req); if (!s) return json(res, 401, { error: 'Authentication required' });
    const id = url.pathname.split('/').pop();
    const store = readJson(TASKS_FILE, { tasks: [] });
    store.tasks = store.tasks.filter(t => t.id !== id);
    writeJson(TASKS_FILE, store);
    return json(res, 200, { ok: true });
  }
  return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

server.listen(PORT, '0.0.0.0', () => console.log('Myxxit ops dashboard running on port ' + PORT));
