function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pill(status) {
  const map = {
    inbox: { label: 'Inbox', cls: 'pill inbox' },
    next: { label: 'Next', cls: 'pill next' },
    scheduled: { label: 'Scheduled', cls: 'pill scheduled' },
    waiting: { label: 'Waiting', cls: 'pill waiting' },
    done: { label: 'Done', cls: 'pill done' },
  };
  const v = map[status] || { label: status, cls: 'pill' };
  return `<span class="${v.cls}">${escapeHtml(v.label)}</span>`;
}

function nav(active) {
  const items = [
    { key: 'home', label: 'Home', href: '/' },
    { key: 'inbox', label: 'Inbox', href: '/tasks/inbox' },
    { key: 'next', label: 'Next', href: '/tasks/next' },
    { key: 'scheduled', label: 'Scheduled', href: '/tasks/scheduled' },
    { key: 'waiting', label: 'Waiting', href: '/tasks/waiting' },
    { key: 'done', label: 'Done', href: '/tasks/done' },
    { key: 'all', label: 'All', href: '/tasks' },
    { key: 'usage', label: 'Usage', href: '/usage' },
    { key: 'jobs', label: 'Jobs', href: '/jobs' },
    { key: 'import', label: 'Import', href: '/import' },
    { key: 'links', label: 'Links', href: '/links' },
    { key: 'health', label: 'Health', href: '/health' },
  ];

  return `<nav class="nav">
    ${items
      .map((it) => {
        const cls = it.key === active ? 'nav-item active' : 'nav-item';
        return `<a class="${cls}" href="${it.href}">${escapeHtml(it.label)}</a>`;
      })
      .join('')}
  </nav>`;
}

function layout({ title, body, active }) {
  return `<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
  <header class="header">
    <div class="brand">
      <div class="brand-title">Brad Control Center</div>
      <div class="brand-sub">IA + Excel + Execução. Sem teatro.</div>
    </div>
    ${nav(active)}
  </header>
  <main class="container">
    ${body}
  </main>
  <footer class="footer">
    <div class="inline">
      <a class="btn secondary" href="/import">Import</a>
      <form method="POST" action="/import/inbox-md" class="inline">
        <button class="btn secondary" type="submit">Import INBOX.md</button>
      </form>
    </div>
    <span class="muted">Local only · <a href="http://localhost:4677" target="_blank" rel="noreferrer">Bot Store</a></span>
  </footer>
</body>
</html>`;
}

function taskForm({ defaultStatus = 'inbox' } = {}) {
  return `
    <div class="card">
      <h2>Quick add</h2>
      <form method="POST" action="/task" class="grid">
        <label>
          <span>Title</span>
          <input name="title" required placeholder="Ex: Preparar forecast por cliente X" />
        </label>
        <label>
          <span>Status</span>
          <select name="status">
            <option value="inbox" ${defaultStatus === 'inbox' ? 'selected' : ''}>Inbox</option>
            <option value="next" ${defaultStatus === 'next' ? 'selected' : ''}>Next</option>
            <option value="scheduled" ${defaultStatus === 'scheduled' ? 'selected' : ''}>Scheduled</option>
            <option value="waiting" ${defaultStatus === 'waiting' ? 'selected' : ''}>Waiting</option>
            <option value="done" ${defaultStatus === 'done' ? 'selected' : ''}>Done</option>
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select name="priority">
            <option value="1">1 (high)</option>
            <option value="2" selected>2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5 (low)</option>
          </select>
        </label>
        <label>
          <span>Due date</span>
          <input name="due_date" placeholder="YYYY-MM-DD" />
        </label>
        <label class="full">
          <span>Notes</span>
          <textarea name="notes" rows="3" placeholder="Context / next step / owner…"></textarea>
        </label>
        <div class="full">
          <button class="btn" type="submit">Add</button>
        </div>
      </form>
    </div>
  `;
}

function taskTable(tasks) {
  if (!tasks.length) {
    return `<div class="card muted">Nada aqui. Boa.</div>`;
  }

  const rows = tasks
    .map((t) => {
      const due = t.due_date ? escapeHtml(t.due_date) : '<span class="muted">—</span>';
      const notes = t.notes ? escapeHtml(t.notes) : '';
      return `
        <tr>
          <td class="w-48">
            ${pill(t.status)}
            <div class="muted small">#${t.id} · P${t.priority}</div>
          </td>
          <td>
            <div class="title">${escapeHtml(t.title)}</div>
            ${notes ? `<div class="muted small">${notes}</div>` : ''}
          </td>
          <td class="w-24">${due}</td>
          <td class="w-24">
            <form method="POST" action="/task/${t.id}" class="inline">
              <select name="status">
                <option value="inbox" ${t.status === 'inbox' ? 'selected' : ''}>Inbox</option>
                <option value="next" ${t.status === 'next' ? 'selected' : ''}>Next</option>
                <option value="scheduled" ${t.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                <option value="waiting" ${t.status === 'waiting' ? 'selected' : ''}>Waiting</option>
                <option value="done" ${t.status === 'done' ? 'selected' : ''}>Done</option>
              </select>
              <button class="btn small" type="submit">Move</button>
            </form>
            <form method="POST" action="/task/${t.id}" class="inline" onsubmit="return confirm('Delete this task?');">
              <input type="hidden" name="action" value="delete" />
              <button class="btn danger small" type="submit">Delete</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Task</th>
            <th>Due</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

module.exports = { layout, taskTable, taskForm, pill, escapeHtml };
