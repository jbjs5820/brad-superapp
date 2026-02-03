const path = require('path');
const fs = require('fs');
const express = require('express');
const dayjs = require('dayjs');
const os = require('os');
const multer = require('multer');
const { execSync } = require('child_process');

const { db, initDb } = require('./src/db');
const {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  importFromInboxMd,
  getGitInfo,
} = require('./src/tasks');
const { createMemory, getMemory, listMemories, listMemoriesByTag, searchMemories } = require('./src/memory');
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

const uploadsDir = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

function readJsonlUsage({ days = 7, maxFiles = 80 } = {}) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const dir = path.join(os.homedir(), '.clawdbot', 'agents', 'main', 'sessions');
  if (!fs.existsSync(dir)) return { dir, byDay: {}, sessions: [] };

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      return { f, p, mtimeMs: st.mtimeMs, size: st.size };
    })
    .filter((x) => x.mtimeMs >= cutoff)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxFiles);

  const byDay = {}; // YYYY-MM-DD -> counters
  const sessions = []; // per file summary

  for (const file of files) {
    let sum = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0, messages: 0 };
    const lines = fs.readFileSync(file.p, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.type !== 'message') continue;
      const usage = obj.usage || (obj.message && obj.message.usage);
      if (!usage) continue;

      const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : file.mtimeMs;
      const day = dayjs(ts).format('YYYY-MM-DD');
      if (!byDay[day]) {
        byDay[day] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0, messages: 0 };
      }

      const costTotal = usage.cost && typeof usage.cost.total === 'number' ? usage.cost.total : 0;
      const input = Number(usage.input || 0);
      const output = Number(usage.output || 0);
      const cacheRead = Number(usage.cacheRead || 0);
      const cacheWrite = Number(usage.cacheWrite || 0);
      const totalTokens = Number(usage.totalTokens || 0);

      byDay[day].input += input;
      byDay[day].output += output;
      byDay[day].cacheRead += cacheRead;
      byDay[day].cacheWrite += cacheWrite;
      byDay[day].totalTokens += totalTokens;
      byDay[day].costTotal += costTotal;
      byDay[day].messages += 1;

      sum.input += input;
      sum.output += output;
      sum.cacheRead += cacheRead;
      sum.cacheWrite += cacheWrite;
      sum.totalTokens += totalTokens;
      sum.costTotal += costTotal;
      sum.messages += 1;
    }

    sessions.push({
      file: file.f,
      mtime: dayjs(file.mtimeMs).format('YYYY-MM-DD HH:mm'),
      totalTokens: sum.totalTokens,
      costTotal: sum.costTotal,
      messages: sum.messages,
      path: file.p,
    });
  }

  return { dir, byDay, sessions };
}

function fmtNum(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n || 0));
}

function fmtUsd(n) {
  if (!n) return '$0.00';
  return '$' + Number(n).toFixed(4);
}

app.get('/', (req, res) => {
  const usage = readJsonlUsage({ days: 7, maxFiles: 40 });
  const days = Object.keys(usage.byDay).sort().reverse();
  const today = days[0] ? usage.byDay[days[0]] : null;

  const notice = req.query.notice ? `<div class="notice">${escapeHtml(String(req.query.notice))}</div>` : '';

  res.send(
    layout({
      title: 'Home · Brad Control Center',
      active: 'home',
      body: `
        <h1>Central</h1>
        <p class="muted">Cockpit local para tarefas, jobs e observabilidade.</p>
        ${notice}

        <div class="row">
          <div class="col">
            <div class="card">
              <h2>Hoje</h2>
              <div class="muted small">Tokens (7d logs locais)</div>
              <div style="margin-top:8px"><strong>${today ? fmtNum(today.totalTokens) : '—'}</strong> tokens</div>
              <div class="muted small">Custo estimado: <strong>${today ? fmtUsd(today.costTotal) : '—'}</strong></div>
              <div class="spacer"></div>
              <a class="btn" href="/usage">Ver Usage</a>
            </div>
          </div>
          <div class="col">
            <div class="card">
              <h2>Jobs</h2>
              <div class="muted small">Ações rápidas (digest/import).</div>
              <div class="spacer"></div>
              <a class="btn" href="/jobs">Abrir Jobs</a>
            </div>
          </div>
        </div>

        <div class="spacer"></div>
        <div class="row">
          <div class="col">
            <div class="card">
              <h2>Apps</h2>
              <ul class="links">
                <li>✅ <a href="/tasks/inbox">Control Center (Tasks)</a></li>
                <li>✅ <a href="http://localhost:4677" target="_blank" rel="noreferrer">Bot Store</a></li>
              </ul>
            </div>
          </div>
        </div>
      `,
    })
  );
});

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

app.get('/usage', (req, res) => {
  const days = req.query.days ? Math.max(1, Math.min(30, Number(req.query.days))) : 7;
  const usage = readJsonlUsage({ days, maxFiles: 120 });
  const keys = Object.keys(usage.byDay).sort().reverse();

  const rows = keys
    .map((k) => {
      const d = usage.byDay[k];
      return `<tr>
        <td class="w-48"><strong>${escapeHtml(k)}</strong><div class="muted small">${d.messages} msg(s)</div></td>
        <td class="w-24">${fmtNum(d.input)}</td>
        <td class="w-24">${fmtNum(d.output)}</td>
        <td class="w-24">${fmtNum(d.cacheRead)}</td>
        <td class="w-24">${fmtNum(d.totalTokens)}</td>
        <td class="w-24">${escapeHtml(fmtUsd(d.costTotal))}</td>
      </tr>`;
    })
    .join('');

  const top = usage.sessions
    .filter((s) => s.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10)
    .map(
      (s) =>
        `<li><strong>${fmtNum(s.totalTokens)}</strong> tokens · ${escapeHtml(fmtUsd(s.costTotal))} · <span class="muted">${escapeHtml(
          s.mtime
        )}</span><div class="muted small">${escapeHtml(s.file)}</div></li>`
    )
    .join('');

  res.send(
    layout({
      title: 'Usage · Brad Control Center',
      active: 'usage',
      body: `
        <h1>Usage</h1>
        <p class="muted">Fonte: logs locais do Clawdbot (<code>${escapeHtml(usage.dir)}</code>). Custos são estimados a partir do campo <code>usage.cost.total</code> quando disponível.</p>

        <form method="GET" action="/usage" class="inline">
          <label class="muted small">Dias
            <select name="days">
              ${[1, 3, 7, 14, 30]
                .map((d) => `<option value="${d}" ${d === days ? 'selected' : ''}>${d}</option>`)
                .join('')}
            </select>
          </label>
          <button class="btn secondary" type="submit">Atualizar</button>
        </form>

        <div class="spacer"></div>
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Input</th>
                <th>Output</th>
                <th>Cache read</th>
                <th>Total</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="6" class="muted">Sem dados.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="spacer"></div>
        <h2>Top sessões (tokens)</h2>
        <ul class="links">
          ${top || '<li class="muted">Sem dados.</li>'}
        </ul>
      `,
    })
  );
});

app.get('/jobs', (req, res) => {
  const notice = req.query.notice ? `<div class="notice">${escapeHtml(String(req.query.notice))}</div>` : '';
  res.send(
    layout({
      title: 'Jobs · Brad Control Center',
      active: 'jobs',
      body: `
        <h1>Jobs</h1>
        <p class="muted">Ações rápidas. Tudo local e sem input do utilizador.</p>
        ${notice}

        <div class="row">
          <div class="col">
            <div class="card">
              <h2>Email digest (agora)</h2>
              <form method="POST" action="/jobs/run-digest" class="inline">
                <button class="btn" type="submit">Run digest now</button>
              </form>
              <div class="muted small" style="margin-top:10px">Isto faz <span class="code-inline">clawdbot cron run d0502... --force</span></div>
            </div>
          </div>
          <div class="col">
            <div class="card">
              <h2>Import INBOX.md</h2>
              <form method="POST" action="/import/inbox-md" class="inline">
                <button class="btn secondary" type="submit">Import INBOX.md</button>
              </form>
              <div class="muted small" style="margin-top:10px">Idempotente por título.</div>
            </div>
          </div>
        </div>

        <div class="spacer"></div>
        <div class="card">
          <h2>Links</h2>
          <div class="inline">
            <a class="btn secondary" href="/usage">Usage</a>
            <a class="btn secondary" href="/memory">Memory</a>
            <a class="btn secondary" href="/health">Health</a>
            <a class="btn secondary" href="http://localhost:4677" target="_blank" rel="noreferrer">Bot Store</a>
          </div>
        </div>
      `,
    })
  );
});

app.post('/jobs/run-digest', (req, res) => {
  try {
    execSync('clawdbot cron run d0502bb6-f558-449e-96e0-44c97553254a --force', {
      stdio: 'pipe',
      timeout: 10 * 60 * 1000,
    });
    return res.redirect('/jobs?notice=' + encodeURIComponent('Digest disparado. Se não chegar, vê o /health + cron runs.'));
  } catch (e) {
    return res.redirect('/jobs?notice=' + encodeURIComponent('Falhou a correr o digest. Vê logs no terminal.'));
  }
});

app.get('/memory', (req, res) => {
  const q = req.query.q ? String(req.query.q) : '';
  const createdId = req.query.created ? Number(req.query.created) : null;
  const notice = createdId ? `<div class="notice">✅ Nota guardada (#${createdId}).</div>` : '';

  const results = q.trim() ? searchMemories({ q, limit: 50 }) : listMemories({ limit: 30 });

  const items = results
    .map((m) => {
      const tags = m.tags ? `<div class="muted small">Tags: ${escapeHtml(m.tags)}</div>` : '';
      const body = escapeHtml(m.body || '');
      const preview = body.length > 280 ? body.slice(0, 280) + '…' : body;
      return `<li>
        <div><strong><a href="/memory/${m.id}">${escapeHtml(m.title)}</a></strong> <span class="muted small">#${m.id} · ${escapeHtml(
        String(m.updated_at).slice(0, 19)
      )}</span></div>
        ${tags}
        <div class="muted small" style="margin-top:6px">${preview}</div>
      </li>`;
    })
    .join('');

  res.send(
    layout({
      title: 'Memory · Brad Control Center',
      active: 'memory',
      body: `
        <h1>Memory</h1>
        <p class="muted">Memória persistente (SQLite + FTS5). Auditável e local.</p>
        ${notice}

        <div class="row">
          <div class="col">
            <div class="card">
              <h2>Guardar nota</h2>
              <form method="POST" action="/memory" class="grid">
                <label class="full">
                  <span>Título</span>
                  <input name="title" required placeholder="Ex: Decisão sobre Mac mini / pricing / roadmap" />
                </label>
                <label class="full">
                  <span>Tags</span>
                  <input name="tags" placeholder="ex: finance, roadmap, ops" />
                </label>
                <label class="full">
                  <span>Texto</span>
                  <textarea name="body" rows="6" required placeholder="Escreve aqui a decisão/nota/contexto…"></textarea>
                </label>
                <div class="full">
                  <button class="btn" type="submit">Guardar</button>
                </div>
              </form>
            </div>
          </div>
          <div class="col">
            <div class="card">
              <h2>Pesquisar</h2>
              <form method="GET" action="/memory" class="inline">
                <input name="q" placeholder="Search…" value="${escapeHtml(q)}" style="min-width:280px" />
                <button class="btn secondary" type="submit">Search</button>
              </form>
              <div class="spacer"></div>
              <ul class="links">
                ${items || '<li class="muted">Sem notas ainda.</li>'}
              </ul>
            </div>
          </div>
        </div>
      `,
    })
  );
});

app.post('/memory', (req, res) => {
  const title = (req.body.title || '').trim();
  const tags = (req.body.tags || '').trim();
  const body = (req.body.body || '').trim();

  if (!title || !body) {
    return res.redirect('/memory?notice=' + encodeURIComponent('Falta título ou texto.'));
  }

  const id = createMemory({ title, tags, body });
  return res.redirect('/memory?created=' + id);
});

app.get('/memory/:id', (req, res) => {
  const id = Number(req.params.id);
  const m = getMemory(id);
  if (!m) return res.status(404).send('Not found');

  res.send(
    layout({
      title: `${m.title} · Memory · Brad Control Center`,
      active: 'memory',
      body: `
        <div class="row">
          <div class="col">
            <h1>${escapeHtml(m.title)}</h1>
            <p class="muted small">#${m.id} · created ${escapeHtml(String(m.created_at).slice(0, 19))} · updated ${escapeHtml(
        String(m.updated_at).slice(0, 19)
      )}</p>
            ${m.tags ? `<p class="muted small">Tags: ${escapeHtml(m.tags)}</p>` : ''}
            <div class="card">
              <pre class="code" style="white-space:pre-wrap">${escapeHtml(m.body)}</pre>
            </div>
            <div class="spacer"></div>
            <a class="btn secondary" href="/memory">Back</a>
          </div>
        </div>
      `,
    })
  );
});

function guessExt(originalName) {
  const base = path.basename(originalName || '');
  const m = base.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

function extractTextFromFile({ filePath, originalName }) {
  const ext = guessExt(originalName);
  const isPdf = ext === 'pdf';

  if (isPdf) {
    // 1) OCR the PDF (generates a searchable PDF) and write extracted text to sidecar
    const outPdf = filePath + '.ocr.pdf';
    const sidecar = filePath + '.txt';
    execSync(`ocrmypdf --sidecar "${sidecar}" --force-ocr "${filePath}" "${outPdf}"`, {
      stdio: 'pipe',
      timeout: 8 * 60 * 1000,
    });
    const text = fs.readFileSync(sidecar, 'utf8');
    return { text, outPath: outPdf, sidecarPath: sidecar, method: 'ocrmypdf' };
  }

  // Plain text/markdown -> treat as-is (useful for quick tests)
  if (['txt', 'md', 'csv', 'log'].includes(ext)) {
    const text = fs.readFileSync(filePath, 'utf8');
    return { text, outPath: filePath, sidecarPath: null, method: 'raw' };
  }

  // Images (png/jpg/etc) -> tesseract to stdout
  const cmd = `tesseract "${filePath}" stdout -l eng`;
  const text = execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 3 * 60 * 1000 }).toString();
  return { text, outPath: filePath, sidecarPath: null, method: 'tesseract' };
}

app.get('/docs', (req, res) => {
  const notice = req.query.notice ? `<div class="notice">${escapeHtml(String(req.query.notice))}</div>` : '';
  const docs = listMemoriesByTag({ tag: 'doc', limit: 20 });

  const items = docs
    .map((m) => {
      const tags = m.tags ? `<div class="muted small">Tags: ${escapeHtml(m.tags)}</div>` : '';
      const preview = escapeHtml(m.body || '').slice(0, 220) + (m.body && m.body.length > 220 ? '…' : '');
      return `<li>
        <div><strong><a href="/memory/${m.id}">${escapeHtml(m.title)}</a></strong> <span class="muted small">#${m.id}</span></div>
        ${tags}
        <div class="muted small" style="margin-top:6px">${preview}</div>
      </li>`;
    })
    .join('');

  res.send(
    layout({
      title: 'Docs · Brad Control Center',
      active: 'docs',
      body: `
        <h1>Docs</h1>
        <p class="muted">Upload de PDFs/imagens → OCR local → guardado na Memory (tags: <span class="code-inline">doc</span>).</p>
        ${notice}

        <div class="card">
          <h2>Importar documento</h2>
          <form method="POST" action="/docs/upload" enctype="multipart/form-data" class="grid">
            <label class="full">
              <span>Ficheiro (PDF/JPG/PNG)</span>
              <input type="file" name="file" required />
            </label>
            <label class="full">
              <span>Tags (opcional)</span>
              <input name="tags" placeholder="ex: bank, invoice, statement" />
            </label>
            <div class="full">
              <button class="btn" type="submit">Upload + OCR</button>
            </div>
          </form>
          <div class="muted small" style="margin-top:10px">Limite: 25MB. PDF usa <span class="code-inline">ocrmypdf</span>. Imagem usa <span class="code-inline">tesseract</span>.</div>
        </div>

        <div class="spacer"></div>
        <h2>Recentes</h2>
        <ul class="links">
          ${items || '<li class="muted">Sem documentos ainda.</li>'}
        </ul>
      `,
    })
  );
});

app.post('/docs/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.redirect('/docs?notice=' + encodeURIComponent('Sem ficheiro.'));

    const tags = (req.body.tags || '').trim();
    const original = req.file.originalname || 'document';

    const { text, method } = extractTextFromFile({ filePath: req.file.path, originalName: original });

    const body = text.length > 80000 ? text.slice(0, 80000) + '\n\n[TRUNCATED]' : text;
    const id = createMemory({
      title: `Doc: ${original}`,
      tags: ['doc', method, tags].filter(Boolean).join(', '),
      body,
    });

    return res.redirect('/docs?notice=' + encodeURIComponent(`Importado e indexado na Memory (#${id}).`));
  } catch (e) {
    return res.redirect('/docs?notice=' + encodeURIComponent('Falhou OCR/import.'));
  }
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
