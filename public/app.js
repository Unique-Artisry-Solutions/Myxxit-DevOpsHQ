const app = document.getElementById('app');
let session = null;
let tasks = [];
let roster = [];
let rosterError = '';
let editingId = null;
let currentView = 'work';
let pendingNotice = '';

// Search, filter, and sort state
let searchQuery = '';
let filterStatus = '';
let filterRisk = '';
let filterOwner = '';
let sortBy = 'updated';

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

function normalizeProgress(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function progressTone(value) {
  if (value >= 80) return 'good';
  if (value >= 40) return 'warn';
  return 'bad';
}

function renderProgressIndicator(task) {
  const value = normalizeProgress(task.progress);
  const tone = progressTone(value);
  return `
    <div class="progress-shell">
      <div class="progress-head">
        <span class="muted small">Progress</span>
        <span class="progress-value">${value}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${tone}" style="width:${value}%"></div>
      </div>
    </div>`;
}

function formatEventTimestamp(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function renderEventSection(task) {
  const events = (task.events || []).slice(0, 5);
  const content = events.length
    ? events.map(event => `
        <div class="event-row">
          <div class="event-meta">
            <span class="badge dot accent">${esc(titleCase(event.type || 'progress'))}</span>
            <span class="muted small">${esc(formatEventTimestamp(event.createdAt) || 'recent')}</span>
          </div>
          <div class="event-detail">${esc(event.detail || '')}</div>
        </div>
      `).join('')
    : '<div class="event-empty">No progress updates logged yet.</div>';
  return `
    <div class="event-section">
      <div class="event-header">
        <strong>Progress log</strong>
        <button type="button" class="ghost ghost-small" onclick="logTaskEvent('${task.id}')">Log progress</button>
      </div>
      ${content}
      ${task.events && task.events.length > events.length ? '<div class="event-more muted small">Showing latest updates.</div>' : ''}
    </div>`;
}

function rosterLaneLabel(value) {
  const lane = String(value || '').toLowerCase();
  if (lane === 'leadership') return 'Leadership lane';
  if (lane === 'core') return 'Core bot lane';
  if (lane === 'specialist') return 'Specialist lane';
  return lane ? `${lane.charAt(0).toUpperCase()}${lane.slice(1)} lane` : 'Lane';
}

function renderModelLine(label, value) {
  if (!value) return '';
  return `<div class="role-matrix-row"><span class="muted small">${label}</span><span>${esc(value)}</span></div>`;
}

function renderRosterCards(list) {
  if (!list.length) {
    return '<div class="roster-empty">No entries yet.</div>';
  }
  return list.map(role => `
    <div class="role-card ${role.active !== false ? 'role-active' : 'role-standby'}">
      <div class="role-head">
        <div>
          <div class="role-name">${esc(role.displayName)}</div>
          <div class="muted small">${esc(role.role)}</div>
        </div>
        <div class="role-pills">
          <span class="badge accent">${esc(rosterLaneLabel(role.lane))}</span>
          <span class="badge ${role.active !== false ? 'good' : 'warn'}">${role.active !== false ? 'Active' : 'Standby'}</span>
        </div>
      </div>
      <div class="role-section">
        <div class="muted small">Primary responsibility</div>
        <p>${esc(role.responsibility)}</p>
      </div>
      <div class="role-matrix">
        ${renderModelLine('Default model', role.defaultModel)}
        ${renderModelLine('Fallback model', role.fallbackModel)}
        ${renderModelLine('Review model', role.reviewModel)}
        ${renderModelLine('Posting mode', role.postingMode)}
        ${renderModelLine('Update format', role.updateFormat)}
        ${renderModelLine('Approval needed', role.approval)}
      </div>
      ${role.notes ? `<div class="role-notes muted small">${esc(role.notes)}</div>` : ''}
    </div>
  `).join('');
}

function renderRosterSection() {
  if (rosterError) {
    return `
      <div class="card">
        <div class="section-title">
          <div>
            <h2>Org chart roster</h2>
            <div class="muted small">Roster entries pull directly from Supabase once seeded.</div>
          </div>
        </div>
        <div class="notice">${esc(rosterError)}</div>
      </div>`;
  }
  if (!roster.length) {
    return `
      <div class="card">
        <div class="section-title">
          <div>
            <h2>Org chart roster</h2>
            <div class="muted small">Roster entries pull directly from Supabase once seeded.</div>
          </div>
        </div>
        <div class="roster-empty">No roster data found. Run scripts/roster_seed.sql to load baseline entries.</div>
      </div>`;
  }
  const active = roster.filter(role => role.active !== false);
  const standby = roster.filter(role => role.active === false);
  return `
    <div class="card">
      <div class="section-title">
        <div>
          <h2>Org chart roster</h2>
          <div class="muted small">Leadership + bot lanes with responsibilities, models, and approval rules.</div>
        </div>
        <span class="badge accent">${roster.length} entries</span>
      </div>
      <div class="roster-block">
        <div class="roster-heading">
          <strong>Active lanes</strong>
          <span class="muted small">Recommended first wave</span>
        </div>
        <div class="roster-grid">
          ${renderRosterCards(active)}
        </div>
      </div>
      ${standby.length ? `
        <div class="roster-block">
          <div class="roster-heading">
            <strong>Standby lanes</strong>
            <span class="muted small">Bring online when pressure increases</span>
          </div>
          <div class="roster-grid">
            ${renderRosterCards(standby)}
          </div>
        </div>` : ''}
    </div>`;
}

function renderNavigationShell() {
  return `
    <header class="nav-shell">
      <div class="container nav-bar">
        <div>
          <div class="brand-label">Myxxit Dev Ops HQ</div>
          <div class="muted small">Internal only · ${esc(session?.username || 'travis')}</div>
        </div>
        <div class="nav-tabs">
          <button type="button" class="nav-tab ${currentView === 'work' ? 'active' : ''}" data-view="work">Work surface</button>
          <button type="button" class="nav-tab ${currentView === 'org' ? 'active' : ''}" data-view="org">Org chart</button>
        </div>
      </div>
    </header>`;
}

function buildLaneStats() {
  const lanes = new Map();
  roster.forEach(entry => {
    const laneKey = entry.lane || 'unsorted';
    if (!lanes.has(laneKey)) {
      lanes.set(laneKey, {
        lane: laneKey,
        active: 0,
        standby: 0,
        total: 0,
        order: Number.isFinite(entry.laneOrder) ? entry.laneOrder : Number.MAX_SAFE_INTEGER,
      });
    }
    const lane = lanes.get(laneKey);
    lane.total += 1;
    if (entry.active === false) lane.standby += 1;
    else lane.active += 1;
    const incomingOrder = Number.isFinite(entry.laneOrder) ? entry.laneOrder : lane.order;
    lane.order = Math.min(lane.order, incomingOrder);
  });
  return Array.from(lanes.values()).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.lane.localeCompare(b.lane);
  });
}

function renderLaneSummarySection() {
  if (rosterError) {
    return `<div class="notice">${esc(rosterError)}</div>`;
  }
  if (!roster.length) {
    return '<div class="muted small">No roster data yet. Seed Supabase via scripts/roster_seed.sql.</div>';
  }
  const lanes = buildLaneStats();
  return `
    <div class="org-stats">
      ${lanes.map(lane => `
        <div class="org-stat">
          <div class="muted small">${esc(rosterLaneLabel(lane.lane))}</div>
          <div class="org-stat-counts">
            <span class="org-stat-primary">${lane.active}</span>
            <span class="muted small">active</span>
          </div>
          <div class="muted small">${lane.standby ? `${lane.standby} standby` : 'Fully staffed'}</div>
        </div>
      `).join('')}
    </div>`;
}

function renderOrgView() {
  const activeCount = roster.filter(role => role.active !== false).length;
  return `
    <div class="container grid org-view">
      <div class="card">
        <div class="hero">
          <div class="hero-copy">
            <div class="hero-kicker">Org intelligence</div>
            <h1>Org chart + roster lanes</h1>
            <p>Single source of truth for approved seats, responsibilities, default models, and activation status.</p>
          </div>
          <div class="hero-actions">
            <span class="badge accent">${roster.length} seats tracked</span>
            <span class="badge accent">${activeCount} active today</span>
          </div>
        </div>
        <div class="org-note muted small">Keep this in sync with Supabase roster_entries. Only approved seats live here.</div>
        ${renderLaneSummarySection()}
      </div>
      ${renderRosterSection()}
    </div>`;
}


function stats() {
  const pending = tasks.filter(t => t.approval === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const highRisk = tasks.filter(t => t.risk === 'high').length;
  return { pending, inProgress, completed, highRisk };
}

function getFilteredAndSortedTasks() {
  let filtered = tasks.filter(task => {
    // Search filter: match title, id, owner, or branch
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        (task.title && task.title.toLowerCase().includes(q)) ||
        (task.id && task.id.toLowerCase().includes(q)) ||
        (task.owner && task.owner.toLowerCase().includes(q)) ||
        (task.branch && task.branch.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }

    // Status filter
    if (filterStatus && task.status !== filterStatus) return false;

    // Risk filter
    if (filterRisk && task.risk !== filterRisk) return false;

    // Owner filter
    if (filterOwner && task.owner !== filterOwner) return false;

    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === 'updated') {
      // Newest first
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    } else if (sortBy === 'risk') {
      // High to low
      const riskOrder = { high: 3, medium: 2, low: 1 };
      return (riskOrder[b.risk] || 0) - (riskOrder[a.risk] || 0);
    } else if (sortBy === 'status') {
      // Custom order: proposed, approved, in-progress, completed, blocked
      const statusOrder = { proposed: 1, approved: 2, 'in-progress': 3, completed: 4, blocked: 5 };
      return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
    }
    return 0;
  });

  return filtered;
}

function renderLogin(error = '') {
  app.innerHTML = `
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
          ${error ? `<div class="notice">${esc(error)}</div>` : ''}
        </form>
      </div>
    </div>`;

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
  const approveDisabled = task.approval === 'approved';
  const beginDisabled = ['in-progress', 'completed'].includes(task.status);
  return `
    <div class="task">
      <div class="task-top">
        <div class="task-copy">
          <h3>${esc(task.title)}</h3>
          <div class="small muted">${esc(task.owner)} · ${esc(task.type)} · updated ${esc(formatEventTimestamp(task.updatedAt) || 'recent')}</div>
          <div class="meta">
            <span class="badge dot ${badgeTone('status', task.status)}">${esc(titleCase(task.status))}</span>
            <span class="badge dot ${badgeTone('risk', task.risk)}">Risk: ${esc(titleCase(task.risk))}</span>
            <span class="badge dot ${badgeTone('approval', task.approval)}">Approval: ${esc(titleCase(task.approval))}</span>
            ${task.branch ? `<span class="badge accent">${esc(task.branch)}</span>` : ''}
            ${task.model ? `<span class="badge accent">${esc(task.model)}</span>` : ''}
          </div>
        </div>
        <div class="actions">
          <button class="ghost" onclick="startEdit('${task.id}')">Edit</button>
          <button class="danger" onclick="removeTask('${task.id}')">Delete</button>
        </div>
      </div>

      ${renderProgressIndicator(task)}
      <div class="task-action-bar">
        <div class="actions tight">
          <button class="secondary" onclick="beginDevelopment('${task.id}')" ${beginDisabled ? 'disabled' : ''}>Begin development</button>
          <button class="success" onclick="approveTask('${task.id}')" ${approveDisabled ? 'disabled' : ''}>Approve</button>
        </div>
      </div>

      ${task.summary ? `<p><strong>Summary:</strong> ${esc(task.summary)}</p>` : ''}
      ${task.recommendation ? `<p><strong>Recommendation:</strong> ${esc(task.recommendation)}</p>` : ''}
      ${task.notes ? `<p><strong>Notes:</strong> ${esc(task.notes)}</p>` : ''}
      ${renderEventSection(task)}
    </div>`;
}

function renderWorkSection(message = '') {
  const current = tasks.find(t => t.id === editingId);
  const s = stats();
  return `
    <div class="container grid work-view">
      <div class="card">
        <div class="hero">
          <div class="hero-copy">
            <div class="hero-kicker">Myxxit Internal Control Surface</div>
            <h1>Ops dashboard for work, approvals, and proposed changes</h1>
            <p>Use this to track what is active, what is risky, what is waiting on Travis, and what should not quietly disappear into chat scrollback.</p>
          </div>
          <div class="hero-actions">
            <span class="badge accent">signed in as ${esc(session.username || 'travis')}</span>
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

        ${message ? `<div class="notice">${esc(message)}</div>` : ''}
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
                  ${['proposed','in-progress','waiting-approval','approved','blocked','completed'].map(v => `<option ${current?.status===v?'selected':''}>${v}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="row">
              <div>
                <label>Risk</label>
                <select name="risk">
                  ${['low','medium','high'].map(v => `<option ${current?.risk===v?'selected':''}>${v}</option>`).join('')}
                </select>
              </div>
              <div>
                <label>Approval</label>
                <select name="approval">
                  ${['pending','approved','rejected'].map(v => `<option ${current?.approval===v?'selected':''}>${v}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="row">
              <div>
                <label>Branch</label>
<input name="branch" value="${esc(current?.branch || '')}" placeholder="hq/example-task or app/example-task" />
</div>
<div>
<label>Target repo</label>
<select name="target_repo" required>
<option value="">Select repo</option>
${['the-drinx-app','Myxxit-DevOpsHQ'].map(v => `<option value="${v}" ${current?.targetRepo===v?'selected':''}>${v}</option>`).join('')}
</select>
</div>
<div>
<label>Owner</label>
<input name="owner" value="${esc(current?.owner || 'Selym')}" />
</div>
<div>
<label>Progress (%)</label>
<input name="progress" type="number" min="0" max="100" value="${esc(normalizeProgress(current?.progress ?? 0))}" />
</div>
</div>

<div class="row">
<div>
<label>Group</label>
<select name="task_group">
${['general','autonomous-workflow','platform','security','cleanup'].map(v => `<option value="${v}" ${current?.taskGroup===v?'selected':''}>${titleCase(v)}</option>`).join('')}
</select>
</div>
<div>
<label>Model</label>
<input name="model" value="${esc(current?.model || '')}" placeholder="openai/gpt-5.1-codex" />
</div>
</div>

<div>
<label>Allowed paths</label>
<input name="allowed_paths" value="${esc(Array.isArray(current?.allowedPaths) ? current.allowedPaths.join(', ') : (current?.allowedPaths || ''))}" placeholder="ops-dashboard-deploy/, ops-dashboard/, vercel-webhook-function/" required />
<div class="muted small">Comma-separated paths. Tasks cannot move in-progress without a declared repo and allowed path scope.</div>
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

          <div class="task-controls">
            <div class="control-row">
              <input 
                type="text" 
                id="searchInput" 
                placeholder="Search by title, ID, owner, or branch..." 
                value="${esc(searchQuery)}"
                class="search-box"
              />
            </div>
            <div class="control-row">
              <select id="filterStatus" class="filter-select">
                <option value="">All statuses</option>
                <option value="proposed" ${filterStatus === 'proposed' ? 'selected' : ''}>Proposed</option>
                <option value="approved" ${filterStatus === 'approved' ? 'selected' : ''}>Approved</option>
                <option value="in-progress" ${filterStatus === 'in-progress' ? 'selected' : ''}>In Progress</option>
                <option value="completed" ${filterStatus === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="blocked" ${filterStatus === 'blocked' ? 'selected' : ''}>Blocked</option>
              </select>
              <select id="filterRisk" class="filter-select">
                <option value="">All risks</option>
                <option value="low" ${filterRisk === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${filterRisk === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${filterRisk === 'high' ? 'selected' : ''}>High</option>
              </select>
              <select id="filterOwner" class="filter-select">
                <option value="">All owners</option>
                ${[...new Set(tasks.map(t => t.owner).filter(Boolean))].sort().map(owner => 
                  `<option value="${esc(owner)}" ${filterOwner === owner ? 'selected' : ''}>${esc(owner)}</option>`
                ).join('')}
              </select>
              <select id="sortBy" class="filter-select">
                <option value="updated" ${sortBy === 'updated' ? 'selected' : ''}>Updated (newest first)</option>
                <option value="risk" ${sortBy === 'risk' ? 'selected' : ''}>Risk (high to low)</option>
                <option value="status" ${sortBy === 'status' ? 'selected' : ''}>Status</option>
              </select>
            </div>
          </div>

          <div class="task-list">
            ${tasks.length > 0 ? (() => {
              const filtered = getFilteredAndSortedTasks();
              return filtered.length 
                ? filtered.map(taskCard).join('') 
                : '<div class="task-empty">No items match your search or filters.</div>';
            })() : '<div class="task-empty">No tracked items yet. Add the first real work item and start using this like an ops surface, not a graveyard.</div>'}
          </div>
        </div>
      </div>
    </div>`;
}


function renderDashboard(message = '') {
  if (message) {
    pendingNotice = message;
  }
  const viewMarkup = currentView === 'org'
    ? renderOrgView()
    : renderWorkSection(pendingNotice);
  if (currentView === 'work') {
    pendingNotice = '';
  }
  app.innerHTML = `
    ${renderNavigationShell()}
    ${viewMarkup}
  `;
  mountNavigation();
  if (currentView === 'work') {
    mountWorkHandlers();
  }
}

function mountNavigation() {
  document.querySelectorAll('.nav-tab').forEach(button => {
    button.onclick = () => {
      const view = button.dataset.view;
      if (!view || view === currentView) return;
      currentView = view;
      renderDashboard();
    };
  });
}

function mountWorkHandlers() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      session = null;
      renderLogin();
    };
  }

  const form = document.getElementById('taskForm');
  if (form) {
    form.onsubmit = saveTask;
  }
  const cancel = document.getElementById('cancelEdit');
  if (cancel) {
    cancel.onclick = () => {
      editingId = null;
      renderDashboard();
    };
  }

  // Search input handler
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = e.target.value;
      renderDashboard();
    };
  }

  // Status filter handler
  const filterStatusSelect = document.getElementById('filterStatus');
  if (filterStatusSelect) {
    filterStatusSelect.onchange = (e) => {
      filterStatus = e.target.value;
      renderDashboard();
    };
  }

  // Risk filter handler
  const filterRiskSelect = document.getElementById('filterRisk');
  if (filterRiskSelect) {
    filterRiskSelect.onchange = (e) => {
      filterRisk = e.target.value;
      renderDashboard();
    };
  }

  // Owner filter handler
  const filterOwnerSelect = document.getElementById('filterOwner');
  if (filterOwnerSelect) {
    filterOwnerSelect.onchange = (e) => {
      filterOwner = e.target.value;
      renderDashboard();
    };
  }

  // Sort handler
  const sortBySelect = document.getElementById('sortBy');
  if (sortBySelect) {
    sortBySelect.onchange = (e) => {
      sortBy = e.target.value;
      renderDashboard();
    };
  }
}



async function saveTask(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  try {
    if (editingId) {
      await api(`/api/tasks/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
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
  await api(`/api/tasks/${id}`, { method: 'DELETE' });
  if (editingId === id) editingId = null;
  await load('Item deleted.');
};

window.logTaskEvent = async function(id) {
  const detail = prompt('Log a progress update for this task:');
  if (!detail) return;
  const typeInput = prompt('Label this update (press enter for "progress")', 'progress') || 'progress';
  try {
    await api(`/api/tasks/${id}/events`, {
      method: 'POST',
      body: JSON.stringify({ detail, type: typeInput }),
    });
    await load('Progress update captured.');
  } catch (err) {
    alert(err.message);
  }
};

window.approveTask = async function(id) {
  const note = prompt('Add an approval note (optional):', '') || '';
  const payload = note.trim() ? { note: note.trim() } : {};
  try {
    await api(`/api/tasks/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await load('Task approved.');
  } catch (err) {
    alert(err.message);
  }
};

window.beginDevelopment = async function(id) {
  const note = prompt('Kickoff note (optional):', '') || '';
  const payload = note.trim() ? { note: note.trim() } : {};
  try {
    await api(`/api/tasks/${id}/begin`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await load('Marked as in development.');
  } catch (err) {
    alert(err.message);
  }
};

async function load(message = '') {
  const sessionData = await api('/api/session');
  if (!sessionData.authenticated) return renderLogin();
  session = sessionData;
  let rosterLoadError = '';
  const [taskData, rosterData] = await Promise.all([
    api('/api/tasks'),
    api('/api/roster').catch(err => {
      rosterLoadError = err.message;
      return { roster: [] };
    }),
  ]);
  tasks = taskData.tasks;
  roster = rosterData.roster || [];
  rosterError = rosterLoadError;
  renderDashboard(message);
}

load().catch(() => renderLogin());
