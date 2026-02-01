const path = require('path');
const fs = require('fs');
const express = require('express');
const dayjs = require('dayjs');

const { db, initDb } = require('./src/db');
const {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  importFromInboxMd,
  getGitInfo,
} = require('./src/tasks');
const { layout, taskTable, taskForm, pill, escapeHtml } = require('./src/views');

const PORT = process.env.PORT || 4567;
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, 'static')));

initDb();

const STATUS = {
  inbox: 'Inbox',
  next: 'Next',
  scheduled: 'Scheduled',
  waiting: 'Waiting',
  done: 'Done',
};

function normalizeStatus(s) {
  if (!s) return 'inbox';
  const v = String(s).toLowerCase();
  if (STATUS[v]) return v;
  return 'inbox';
}

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => res.redirect('/tasks/inbox'));

app.get('/tasks/:status', (req, res) => {
  const status = normalizeStatus(req.params.status);
  const tasks = listTasks({ status });
  const title = `${STATUS[status]} · Brad Control Center`;

  const createdId = req.query.created ? Number(req.query.created) : null;
  const movedId = req.query.moved ? Number(req.query.moved) : null;
  const deletedId = req.query.deleted ? Number(req.query.deleted) : null;
  const error = req.query.error ? String(req.query.error) : null;

  const noticeParts = [];
  if (createdId) noticeParts.push(`✅ Task criada (#${createdId}).`);
  if (movedId) noticeParts.push(`↔️ Task atualizada (#${movedId}).`);
  if (deletedId) noticeParts.push(`🗑️ Task apagada (#${deletedId}).`);
  if (error === 'missing-title') noticeParts.push('⚠️ Falta título (não criei task).');

  const notice = noticeParts.length ? `<div class="notice">${escapeHtml(noticeParts.join(' '))}</div>` : '';

  res.send(
    layout({
      title,
      active: status,
      body: `
        <div class="row">
          <div class="col">
            <h1>${STATUS[status]}</h1>
            <p class="muted">${tasks.length} task(s)</p>
            ${notice}
            ${taskForm({ defaultStatus: status })}
            <div class="spacer"></div>
            ${taskTable(tasks)}
          </div>
        </div>
      `,
    })
  );
});

app.get('/tasks', (req, res) => {
  const status = req.query.status ? normalizeStatus(req.query.status) : null;
  const q = req.query.q ? String(req.query.q) : '';
  const tasks = listTasks({ status, q });
  const title = `All · Brad Control Center`;
  res.send(
    layout({
      title,
      active: status || 'all',
      body: `
        <div class="row">
          <div class="col">
            <h1>All tasks</h1>
            <form method="GET" action="/tasks" class="inline">
              <input name="q" placeholder="Search…" value="${escapeHtml(q)}" />
              <select name="status">
                <option value="" ${status ? '' : 'selected'}>Any status</option>
                ${Object.keys(STATUS)
                  .map((s) => `<option value="${s}" ${status === s ? 'selected' : ''}>${STATUS[s]}</option>`)
                  .join('')}
              </select>
              <button class="btn" type="submit">Filter</button>
            </form>
            <div class="spacer"></div>
            ${taskTable(tasks)}
          </div>
        </div>
      `,
    })
  );
});

app.post('/task', (req, res) => {
  const title = (req.body.title || '').trim();
  const status = normalizeStatus(req.body.status);
  const priority = Number(req.body.priority || 2);
  const due_date = (req.body.due_date || '').trim() || null;
  const notes = (req.body.notes || '').trim() || null;

  if (!title) {
    // deterministic: stay on same page with error
    return res.redirect((req.get('referer') || `/tasks/${status}`) + `?error=missing-title`);
  }

  const id = createTask({ title, status, priority, due_date, notes });
  // deterministic redirect: go to the status list where the task actually lives
  res.redirect(`/tasks/${status}?created=${id}`);
});

app.post('/task/:id', (req, res) => {
  const id = Number(req.params.id);
  const action = req.body.action;

  if (action === 'delete') {
    deleteTask(id);
    const ref = req.get('referer') || '/tasks/inbox';
    return res.redirect(ref + (ref.includes('?') ? '&' : '?') + `deleted=${id}`);
  }

  const patch = {};
  if (req.body.status) patch.status = normalizeStatus(req.body.status);
  if (req.body.priority) patch.priority = Number(req.body.priority);
  if (Object.prototype.hasOwnProperty.call(req.body, 'due_date')) {
    patch.due_date = (req.body.due_date || '').trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
    patch.notes = (req.body.notes || '').trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    patch.title = (req.body.title || '').trim();
  }

  updateTask(id, patch);

  const status = patch.status || null;
  if (status) {
    return res.redirect(`/tasks/${status}?moved=${id}`);
  }

  const ref = req.get('referer') || '/tasks/inbox';
  res.redirect(ref + (ref.includes('?') ? '&' : '?') + `moved=${id}`);
});

app.get('/import', (req, res) => {
  res.send(
    layout({
      title: 'Import · Brad Control Center',
      active: 'import',
      body: `
        <h1>Import</h1>
        <p class="muted">Importa tasks do <code>INBOX.md</code> (idempotente por título).</p>
        <form method="POST" action="/import/inbox-md" class="inline">
          <button class="btn" type="submit">Import INBOX.md</button>
        </form>
      `,
    })
  );
});

app.post('/import/inbox-md', (req, res) => {
  const filePath = path.join(__dirname, '..', 'INBOX.md');
  const result = importFromInboxMd(filePath);
  res.send(
    layout({
      title: 'Import · Brad Control Center',
      active: 'import',
      body: `
        <h1>Import INBOX.md</h1>
        <p>Imported: <strong>${result.imported}</strong> | Skipped (duplicates): <strong>${result.skipped}</strong></p>
        <pre class="code">${escapeHtml(JSON.stringify(result.details, null, 2))}</pre>
        <p><a class="btn" href="/tasks/inbox">Back to Inbox</a></p>
      `,
    })
  );
});

app.get('/links', (req, res) => {
  const base = path.join(__dirname, '..');
  const candidates = [
    { label: 'INBOX.md', p: path.join(base, 'INBOX.md') },
    { label: 'Deck draft (MD)', p: path.join(base, 'outputs', '2026-01-31_artsana_workshop_ai-sales_deck_v2.md') },
    { label: 'Chicco Brandbook (PDF)', p: path.join(base, 'inputs', 'artsana-brand', 'raw', 'Brandbook_Chicco_complete-30Giugno.pdf') },
    { label: 'Chicco POS Guidelines (PDF)', p: path.join(base, 'inputs', 'artsana-brand', 'raw', 'Chicco Graphic Guidelines POS.pdf') },
    { label: 'Social Brand Guidelines (PDF)', p: path.join(base, 'inputs', 'artsana-brand', 'raw', 'Social Brand Guidelines-120623.pdf') },
  ];

  const items = candidates
    .map(({ label, p }) => {
      const exists = fs.existsSync(p);
      const url = 'file://' + p;
      return `<li>${exists ? '✅' : '⚠️'} <a href="${url}">${escapeHtml(label)}</a><div class="muted small">${escapeHtml(p)}</div></li>`;
    })
    .join('');

  res.send(
    layout({
      title: 'Links · Brad Control Center',
      active: 'links',
      body: `
        <h1>Quick links</h1>
        <ul class="links">${items}</ul>
      `,
    })
  );
});

app.get('/health', (req, res) => {
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const git = getGitInfo(path.join(__dirname, '..'));

  res.send(
    layout({
      title: 'Health · Brad Control Center',
      active: 'health',
      body: `
        <h1>Health</h1>
        <div class="card">
          <div><strong>Time (Europe/Lisbon):</strong> ${escapeHtml(now)}</div>
          <div><strong>Node:</strong> ${escapeHtml(process.version)}</div>
          <div><strong>DB:</strong> ${escapeHtml(path.join(__dirname, 'data', 'control-center.sqlite'))}</div>
        </div>
        <div class="spacer"></div>
        <h2>Git</h2>
        <pre class="code">${escapeHtml(JSON.stringify(git, null, 2))}</pre>
      `,
    })
  );
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Brad Control Center running on http://localhost:${PORT}`);
});
