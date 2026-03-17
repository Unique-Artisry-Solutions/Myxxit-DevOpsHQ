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
const CSS = ":root {\n  --bg: #08101c;\n  --bg-2: #10192a;\n  --panel: rgba(14, 22, 37, 0.8);\n  --panel-strong: rgba(19, 31, 51, 0.92);\n  --panel-soft: rgba(255, 255, 255, 0.04);\n  --text: #f5f7ff;\n  --muted: #99a7c2;\n  --muted-2: #7d8ba7;\n  --accent: #7c8cff;\n  --accent-2: #4fd1c5;\n  --good: #22c55e;\n  --warn: #f59e0b;\n  --bad: #ef4444;\n  --border: rgba(255, 255, 255, 0.08);\n  --shadow: 0 24px 80px rgba(0, 0, 0, 0.35);\n}\n\n* { box-sizing: border-box; }\nhtml { color-scheme: dark; }\nbody {\n  margin: 0;\n  min-height: 100vh;\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;\n  color: var(--text);\n  background:\n    radial-gradient(circle at 15% 20%, rgba(124, 140, 255, 0.22), transparent 26%),\n    radial-gradient(circle at 80% 0%, rgba(79, 209, 197, 0.16), transparent 24%),\n    radial-gradient(circle at 80% 60%, rgba(124, 140, 255, 0.12), transparent 28%),\n    linear-gradient(180deg, rgba(8, 16, 28, 0.96), rgba(7, 12, 22, 1)),\n    repeating-linear-gradient(135deg, rgba(255,255,255,0.014) 0 2px, transparent 2px 14px);\n}\nbody::before {\n  content: '';\n  position: fixed;\n  inset: 0;\n  pointer-events: none;\n  background: linear-gradient(180deg, rgba(255,255,255,0.025), transparent 20%, transparent 80%, rgba(255,255,255,0.02));\n  mix-blend-mode: soft-light;\n}\n\n.container {\n  max-width: 1280px;\n  margin: 0 auto;\n  padding: 28px;\n}\n\n.grid { display: grid; gap: 18px; }\n.grid.two { grid-template-columns: 420px minmax(0, 1fr); }\n.grid.stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n\n.card {\n  position: relative;\n  overflow: hidden;\n  background: var(--panel);\n  border: 1px solid var(--border);\n  border-radius: 22px;\n  padding: 22px;\n  box-shadow: var(--shadow);\n  backdrop-filter: blur(18px);\n}\n.card::after {\n  content: '';\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n  background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent 25%);\n}\n.card > * { position: relative; z-index: 1; }\n.card.soft { background: var(--panel-soft); }\n\n.hero {\n  display: grid;\n  gap: 18px;\n  grid-template-columns: 1.3fr auto;\n  align-items: start;\n}\n.hero-copy h1 {\n  margin: 0;\n  font-size: clamp(28px, 4vw, 42px);\n  line-height: 1.02;\n  letter-spacing: -0.03em;\n}\n.hero-copy p {\n  margin: 10px 0 0;\n  color: var(--muted);\n  max-width: 760px;\n  line-height: 1.55;\n}\n.hero-kicker {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 12px;\n  margin-bottom: 12px;\n  border-radius: 999px;\n  color: #dce4ff;\n  border: 1px solid rgba(124,140,255,0.2);\n  background: rgba(124,140,255,0.12);\n  font-size: 12px;\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n}\n.hero-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px;\n  justify-content: flex-end;\n}\n\nh2, h3 { margin: 0; letter-spacing: -0.02em; }\nlabel {\n  display: block;\n  margin-bottom: 8px;\n  font-size: 13px;\n  color: #d7e0f6;\n  letter-spacing: 0.02em;\n}\ninput, select, textarea, button {\n  font: inherit;\n  border-radius: 14px;\n}\ninput, select, textarea {\n  width: 100%;\n  background: rgba(255, 255, 255, 0.045);\n  color: var(--text);\n  border: 1px solid rgba(255,255,255,0.08);\n  padding: 13px 14px;\n  outline: none;\n  transition: 160ms ease;\n}\ninput:focus, select:focus, textarea:focus {\n  border-color: rgba(124, 140, 255, 0.7);\n  box-shadow: 0 0 0 4px rgba(124, 140, 255, 0.14);\n}\ntextarea {\n  min-height: 110px;\n  resize: vertical;\n}\nbutton {\n  border: 0;\n  background: linear-gradient(135deg, var(--accent), #6572ff);\n  color: white;\n  padding: 12px 16px;\n  cursor: pointer;\n  font-weight: 650;\n  transition: transform 120ms ease, opacity 120ms ease, box-shadow 160ms ease;\n  box-shadow: 0 10px 30px rgba(92, 112, 255, 0.24);\n}\nbutton:hover { transform: translateY(-1px); }\nbutton.secondary {\n  background: rgba(255,255,255,0.08);\n  color: var(--text);\n  box-shadow: none;\n}\nbutton.danger {\n  background: linear-gradient(135deg, #ef4444, #dc2626);\n  box-shadow: 0 10px 30px rgba(239, 68, 68, 0.2);\n}\nbutton.ghost {\n  background: transparent;\n  border: 1px solid rgba(255,255,255,0.12);\n  color: #dfe6ff;\n  box-shadow: none;\n}\n\n.actions { display: flex; gap: 10px; flex-wrap: wrap; }\n.row { display: flex; gap: 12px; }\n.row > * { flex: 1; }\n.header {\n  display: flex;\n  justify-content: space-between;\n  align-items: flex-start;\n  gap: 12px;\n  margin-bottom: 16px;\n}\n.header h2 { font-size: 22px; }\n.muted { color: var(--muted); }\n.muted-2 { color: var(--muted-2); }\n.small { font-size: 13px; }\n\n.badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  padding: 7px 11px;\n  border-radius: 999px;\n  background: rgba(255,255,255,0.06);\n  border: 1px solid rgba(255,255,255,0.08);\n  font-size: 12px;\n  color: #d7dcff;\n}\n.badge.dot::before {\n  content: '';\n  width: 8px;\n  height: 8px;\n  border-radius: 999px;\n  background: currentColor;\n  opacity: 0.95;\n}\n.badge.good { color: #7cf2a3; }\n.badge.warn { color: #ffd27c; }\n.badge.bad { color: #ff9595; }\n.badge.accent { color: #bec7ff; }\n\n.notice {\n  margin-top: 14px;\n  padding: 13px 14px;\n  border-radius: 14px;\n  background: rgba(124, 140, 255, 0.12);\n  border: 1px solid rgba(124, 140, 255, 0.28);\n}\n\n.stat {\n  display: grid;\n  gap: 6px;\n  padding: 16px;\n  border-radius: 18px;\n  background: rgba(255,255,255,0.035);\n  border: 1px solid rgba(255,255,255,0.06);\n}\n.stat .value {\n  font-size: 28px;\n  font-weight: 700;\n  letter-spacing: -0.03em;\n}\n.stat .label {\n  font-size: 12px;\n  color: var(--muted);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n}\n\n.section-title {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n  margin-bottom: 12px;\n}\n\n.task-list { display: grid; gap: 14px; }\n.task {\n  border: 1px solid rgba(255,255,255,0.08);\n  border-radius: 18px;\n  padding: 18px;\n  background: rgba(255,255,255,0.03);\n  transition: border-color 150ms ease, transform 150ms ease, background 150ms ease;\n}\n.task:hover {\n  transform: translateY(-1px);\n  border-color: rgba(124,140,255,0.28);\n  background: rgba(255,255,255,0.045);\n}\n.task-top {\n  display: flex;\n  justify-content: space-between;\n  gap: 12px;\n  margin-bottom: 12px;\n}\n.task h3 {\n  font-size: 18px;\n  margin-bottom: 6px;\n}\n.task p {\n  margin: 10px 0 0;\n  line-height: 1.55;\n  color: #e7ecff;\n}\n.meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  margin: 10px 0 0;\n}\n.task-footer {\n  margin-top: 14px;\n  display: flex;\n  justify-content: space-between;\n  gap: 12px;\n  align-items: center;\n}\n.task-copy {\n  display: grid;\n  gap: 8px;\n}\n.task-empty {\n  padding: 22px;\n  border-radius: 18px;\n  border: 1px dashed rgba(255,255,255,0.12);\n  color: var(--muted);\n  text-align: center;\n}\n\n.auth-shell {\n  min-height: 100vh;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 28px;\n}\n.auth-card {\n  width: min(520px, 100%);\n}\n.auth-card h1 {\n  font-size: 34px;\n  margin: 0;\n  letter-spacing: -0.03em;\n}\n.auth-card .subtitle {\n  margin: 12px 0 0;\n  color: var(--muted);\n  line-height: 1.55;\n}\n\n.helper-grid {\n  display: grid;\n  gap: 14px;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  margin-top: 16px;\n}\n.helper-panel {\n  padding: 14px;\n  border-radius: 16px;\n  border: 1px solid rgba(255,255,255,0.08);\n  background: rgba(255,255,255,0.03);\n}\n.helper-panel strong {\n  display: block;\n  margin-bottom: 6px;\n}\n\n.form-shell {\n  display: grid;\n  gap: 16px;\n}\n.form-footer {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n  margin-top: 4px;\n}\n\nhr {\n  border: 0;\n  border-top: 1px solid rgba(255,255,255,0.08);\n  margin: 10px 0;\n}\n\n@media (max-width: 1080px) {\n  .grid.two,\n  .grid.stats,\n  .helper-grid,\n  .hero {\n    grid-template-columns: 1fr;\n  }\n  .hero-actions { justify-content: flex-start; }\n}\n\n@media (max-width: 720px) {\n  .container { padding: 18px; }\n  .row { flex-direction: column; }\n  .task-top, .task-footer, .header { flex-direction: column; }\n  .actions { width: 100%; }\n  .actions button { flex: 1 1 auto; }\n}\n";
const APP_JS = "const app = document.getElementById('app');\nlet session = null;\nlet tasks = [];\nlet editingId = null;\n\nasync function api(path, options = {}) {\n  const res = await fetch(path, {\n    credentials: 'include',\n    headers: { 'Content-Type': 'application/json' },\n    ...options,\n  });\n  const data = await res.json().catch(() => ({}));\n  if (!res.ok) throw new Error(data.error || 'Request failed');\n  return data;\n}\n\nfunction esc(value = '') {\n  return String(value)\n    .replaceAll('&', '&amp;')\n    .replaceAll('<', '&lt;')\n    .replaceAll('>', '&gt;')\n    .replaceAll('\"', '&quot;');\n}\n\nfunction titleCase(value = '') {\n  return String(value)\n    .split('-')\n    .map(part => part.charAt(0).toUpperCase() + part.slice(1))\n    .join(' ');\n}\n\nfunction badgeTone(kind, value) {\n  const v = String(value || '').toLowerCase();\n  if (kind === 'risk') {\n    if (v === 'high') return 'bad';\n    if (v === 'medium') return 'warn';\n    return 'good';\n  }\n  if (kind === 'approval') {\n    if (v === 'approved') return 'good';\n    if (v === 'rejected') return 'bad';\n    return 'warn';\n  }\n  if (kind === 'status') {\n    if (['completed', 'approved'].includes(v)) return 'good';\n    if (['blocked', 'rejected'].includes(v)) return 'bad';\n    if (['waiting-approval', 'in-progress'].includes(v)) return 'warn';\n  }\n  return 'accent';\n}\n\nfunction stats() {\n  const pending = tasks.filter(t => t.approval === 'pending').length;\n  const inProgress = tasks.filter(t => t.status === 'in-progress').length;\n  const completed = tasks.filter(t => t.status === 'completed').length;\n  const highRisk = tasks.filter(t => t.risk === 'high').length;\n  return { pending, inProgress, completed, highRisk };\n}\n\nfunction renderLogin(error = '') {\n  app.innerHTML = `\n    <div class=\"auth-shell\">\n      <div class=\"card auth-card\">\n        <div class=\"hero-kicker\">Private Internal Surface</div>\n        <h1>Myxxit Ops HQ</h1>\n        <p class=\"subtitle\">Track active work, proposed changes, branch-level implementation, and approval decisions without losing the thread in chat.</p>\n\n        <div class=\"helper-grid\">\n          <div class=\"helper-panel\">\n            <strong>What it is</strong>\n            <div class=\"muted small\">A private operating dashboard for Myxxit development, approvals, and task memory.</div>\n          </div>\n          <div class=\"helper-panel\">\n            <strong>What it is not</strong>\n            <div class=\"muted small\">Not Jira, not bloat, not a corporate sadness machine.</div>\n          </div>\n        </div>\n\n        <form id=\"loginForm\" class=\"grid\" style=\"margin-top:18px;\">\n          <div>\n            <label>Username</label>\n            <input name=\"username\" placeholder=\"travis\" value=\"travis\" required />\n          </div>\n          <div>\n            <label>Password</label>\n            <input name=\"password\" type=\"password\" required />\n          </div>\n          <button type=\"submit\">Enter dashboard</button>\n          ${error ? `<div class=\"notice\">${esc(error)}</div>` : ''}\n        </form>\n      </div>\n    </div>`;\n\n  document.getElementById('loginForm').onsubmit = async (e) => {\n    e.preventDefault();\n    const form = new FormData(e.target);\n    try {\n      session = await api('/api/login', {\n        method: 'POST',\n        body: JSON.stringify(Object.fromEntries(form.entries())),\n      });\n      await load();\n    } catch (err) {\n      renderLogin(err.message);\n    }\n  };\n}\n\nfunction taskCard(task) {\n  return `\n    <div class=\"task\">\n      <div class=\"task-top\">\n        <div class=\"task-copy\">\n          <h3>${esc(task.title)}</h3>\n          <div class=\"small muted\">${esc(task.owner)} \u00b7 ${esc(task.type)} \u00b7 updated ${new Date(task.updatedAt).toLocaleString()}</div>\n          <div class=\"meta\">\n            <span class=\"badge dot ${badgeTone('status', task.status)}\">${esc(titleCase(task.status))}</span>\n            <span class=\"badge dot ${badgeTone('risk', task.risk)}\">Risk: ${esc(titleCase(task.risk))}</span>\n            <span class=\"badge dot ${badgeTone('approval', task.approval)}\">Approval: ${esc(titleCase(task.approval))}</span>\n            ${task.branch ? `<span class=\"badge accent\">${esc(task.branch)}</span>` : ''}\n            ${task.model ? `<span class=\"badge accent\">${esc(task.model)}</span>` : ''}\n          </div>\n        </div>\n        <div class=\"actions\">\n          <button class=\"ghost\" onclick=\"startEdit('${task.id}')\">Edit</button>\n          <button class=\"danger\" onclick=\"removeTask('${task.id}')\">Delete</button>\n        </div>\n      </div>\n\n      ${task.summary ? `<p><strong>Summary:</strong> ${esc(task.summary)}</p>` : ''}\n      ${task.recommendation ? `<p><strong>Recommendation:</strong> ${esc(task.recommendation)}</p>` : ''}\n      ${task.notes ? `<p><strong>Notes:</strong> ${esc(task.notes)}</p>` : ''}\n    </div>`;\n}\n\nfunction renderDashboard(message = '') {\n  const current = tasks.find(t => t.id === editingId);\n  const s = stats();\n\n  app.innerHTML = `\n    <div class=\"container grid\">\n      <div class=\"card\">\n        <div class=\"hero\">\n          <div class=\"hero-copy\">\n            <div class=\"hero-kicker\">Myxxit Internal Control Surface</div>\n            <h1>Ops dashboard for work, approvals, and proposed changes</h1>\n            <p>Use this to track what is active, what is risky, what is waiting on Travis, and what should not quietly disappear into chat scrollback.</p>\n          </div>\n          <div class=\"hero-actions\">\n            <span class=\"badge accent\">signed in as ${esc(session.username || 'travis')}</span>\n            <button class=\"secondary\" id=\"passwordBtn\">Change password</button>\n            <button class=\"ghost\" id=\"logoutBtn\">Logout</button>\n          </div>\n        </div>\n\n        <div class=\"grid stats\" style=\"margin-top:18px;\">\n          <div class=\"stat\">\n            <div class=\"label\">Pending approval</div>\n            <div class=\"value\">${s.pending}</div>\n            <div class=\"muted small\">Waiting on a yes or no</div>\n          </div>\n          <div class=\"stat\">\n            <div class=\"label\">In progress</div>\n            <div class=\"value\">${s.inProgress}</div>\n            <div class=\"muted small\">Active work underway</div>\n          </div>\n          <div class=\"stat\">\n            <div class=\"label\">Completed</div>\n            <div class=\"value\">${s.completed}</div>\n            <div class=\"muted small\">Finished or locked in</div>\n          </div>\n          <div class=\"stat\">\n            <div class=\"label\">High risk</div>\n            <div class=\"value\">${s.highRisk}</div>\n            <div class=\"muted small\">Needs careful review</div>\n          </div>\n        </div>\n\n        ${session.mustChangePassword ? '<div class=\"notice\">Security note: change the temporary password now.</div>' : ''}\n        ${message ? `<div class=\"notice\">${esc(message)}</div>` : ''}\n      </div>\n\n      <div class=\"grid two\">\n        <div class=\"card\">\n          <div class=\"section-title\">\n            <div>\n              <h2>${current ? 'Edit tracked item' : 'Create tracked item'}</h2>\n              <div class=\"muted small\">Log actual work, proposed changes, review items, and branch-level status.</div>\n            </div>\n            ${current ? '<span class=\"badge warn\">Editing mode</span>' : '<span class=\"badge accent\">New entry</span>'}\n          </div>\n\n          <form id=\"taskForm\" class=\"form-shell\">\n            <div>\n              <label>Title</label>\n              <input name=\"title\" value=\"${esc(current?.title || '')}\" placeholder=\"Refactor route protection\" required />\n            </div>\n\n            <div class=\"row\">\n              <div>\n                <label>Type</label>\n                <input name=\"type\" value=\"${esc(current?.type || 'task')}\" placeholder=\"task / audit / policy / setup\" />\n              </div>\n              <div>\n                <label>Status</label>\n                <select name=\"status\">\n                  ${['proposed','in-progress','waiting-approval','approved','blocked','completed'].map(v => `<option ${current?.status===v?'selected':''}>${v}</option>`).join('')}\n                </select>\n              </div>\n            </div>\n\n            <div class=\"row\">\n              <div>\n                <label>Risk</label>\n                <select name=\"risk\">\n                  ${['low','medium','high'].map(v => `<option ${current?.risk===v?'selected':''}>${v}</option>`).join('')}\n                </select>\n              </div>\n              <div>\n                <label>Approval</label>\n                <select name=\"approval\">\n                  ${['pending','approved','rejected'].map(v => `<option ${current?.approval===v?'selected':''}>${v}</option>`).join('')}\n                </select>\n              </div>\n            </div>\n\n            <div class=\"row\">\n              <div>\n                <label>Branch</label>\n                <input name=\"branch\" value=\"${esc(current?.branch || '')}\" placeholder=\"dev/example-task\" />\n              </div>\n              <div>\n                <label>Owner</label>\n                <input name=\"owner\" value=\"${esc(current?.owner || 'Selym')}\" />\n              </div>\n            </div>\n\n            <div>\n              <label>Model</label>\n              <input name=\"model\" value=\"${esc(current?.model || '')}\" placeholder=\"openai/gpt-5.1-codex\" />\n            </div>\n\n            <div>\n              <label>Summary</label>\n              <textarea name=\"summary\" placeholder=\"What changed or what is being proposed?\">${esc(current?.summary || '')}</textarea>\n            </div>\n\n            <div>\n              <label>Recommendation</label>\n              <textarea name=\"recommendation\" placeholder=\"What should happen next?\">${esc(current?.recommendation || '')}</textarea>\n            </div>\n\n            <div>\n              <label>Notes</label>\n              <textarea name=\"notes\" placeholder=\"Context, caveats, or approval notes\">${esc(current?.notes || '')}</textarea>\n            </div>\n\n            <div class=\"form-footer\">\n              <div class=\"muted small\">Keep entries tight. This should help us think, not bury us in admin sludge.</div>\n              <div class=\"actions\">\n                ${current ? '<button type=\"button\" class=\"ghost\" id=\"cancelEdit\">Cancel</button>' : ''}\n                <button type=\"submit\">${current ? 'Save changes' : 'Create item'}</button>\n              </div>\n            </div>\n          </form>\n        </div>\n\n        <div class=\"card\">\n          <div class=\"section-title\">\n            <div>\n              <h2>Tracked work</h2>\n              <div class=\"muted small\">What exists, what is risky, and what is waiting for a decision.</div>\n            </div>\n            <span class=\"badge accent\">${tasks.length} items</span>\n          </div>\n\n          <div class=\"task-list\">\n            ${tasks.length ? tasks.map(taskCard).join('') : '<div class=\"task-empty\">No tracked items yet. Add the first real work item and start using this like an ops surface, not a graveyard.</div>'}\n          </div>\n        </div>\n      </div>\n    </div>`;\n\n  document.getElementById('logoutBtn').onclick = async () => {\n    await api('/api/logout', { method: 'POST' });\n    session = null;\n    renderLogin();\n  };\n  document.getElementById('passwordBtn').onclick = renderPasswordForm;\n  document.getElementById('taskForm').onsubmit = saveTask;\n  const cancel = document.getElementById('cancelEdit');\n  if (cancel) cancel.onclick = () => { editingId = null; renderDashboard(); };\n}\n\nfunction renderPasswordForm(message = '', error = '') {\n  app.innerHTML = `\n    <div class=\"auth-shell\">\n      <div class=\"card auth-card\">\n        <div class=\"hero-kicker\">Security</div>\n        <h1>Change dashboard password</h1>\n        <p class=\"subtitle\">Set a new password for the private dashboard. Minimum 12 characters. Make it one you\u2019ll remember without making it idiot bait.</p>\n        ${message ? `<div class=\"notice\">${esc(message)}</div>` : ''}\n        ${error ? `<div class=\"notice\">${esc(error)}</div>` : ''}\n        <form id=\"passwordForm\" class=\"grid\" style=\"margin-top:18px;\">\n          <div><label>Current password</label><input name=\"currentPassword\" type=\"password\" required /></div>\n          <div><label>New password</label><input name=\"newPassword\" type=\"password\" minlength=\"12\" required /></div>\n          <div class=\"actions\">\n            <button type=\"submit\">Update password</button>\n            <button type=\"button\" class=\"ghost\" id=\"backBtn\">Back</button>\n          </div>\n        </form>\n      </div>\n    </div>`;\n\n  document.getElementById('backBtn').onclick = () => renderDashboard();\n  document.getElementById('passwordForm').onsubmit = async (e) => {\n    e.preventDefault();\n    const form = new FormData(e.target);\n    try {\n      await api('/api/change-password', {\n        method: 'POST',\n        body: JSON.stringify(Object.fromEntries(form.entries())),\n      });\n      session.mustChangePassword = false;\n      renderDashboard('Password updated successfully.');\n    } catch (err) {\n      renderPasswordForm('', err.message);\n    }\n  };\n}\n\nasync function saveTask(e) {\n  e.preventDefault();\n  const form = new FormData(e.target);\n  const payload = Object.fromEntries(form.entries());\n  try {\n    if (editingId) {\n      await api(`/api/tasks/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });\n    } else {\n      await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });\n    }\n    editingId = null;\n    await load('Item saved.');\n  } catch (err) {\n    renderDashboard(err.message);\n  }\n}\n\nwindow.startEdit = function(id) {\n  editingId = id;\n  renderDashboard();\n};\n\nwindow.removeTask = async function(id) {\n  if (!confirm('Delete this item?')) return;\n  await api(`/api/tasks/${id}`, { method: 'DELETE' });\n  if (editingId === id) editingId = null;\n  await load('Item deleted.');\n};\n\nasync function load(message = '') {\n  const sessionData = await api('/api/session');\n  if (!sessionData.authenticated) return renderLogin();\n  session = sessionData;\n  const taskData = await api('/api/tasks');\n  tasks = taskData.tasks;\n  renderDashboard(message);\n}\n\nload().catch(() => renderLogin());\n";

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
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Myxxit Dev Ops Dashboard</title><style>${CSS}</style></head><body><div id="app"></div><script>${APP_JS}</script></body></html>`;

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
