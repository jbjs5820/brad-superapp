const path = require('path');
const express = require('express');

const { ManifestSchema } = require('./schema');
const { listAvailablePackages, listInstalledPackages, install, uninstall } = require('./registry');

const PORT = process.env.PORT || 4677;
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:0;background:#0b1020;color:#eef1ff}
    a{color:#4c6fff;text-decoration:none}
    .top{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(7,10,20,.8);position:sticky;top:0}
    .wrap{max-width:1100px;margin:0 auto;padding:20px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .card{border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(16,26,51,.7);padding:14px}
    .muted{color:#a7b0d6}
    code,pre{background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;overflow:auto}
    .btn{display:inline-block;background:#4c6fff;color:white;border:none;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer}
    .btn.secondary{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08)}
  </style></head><body>
    <div class="top"><strong>Brad Bot Store</strong> <span class="muted">(local)</span> · <a href="/">Loja</a> · <a href="/installed">Instalados</a> · <a href="/public/catalog.json">catalog.json</a></div>
    <div class="wrap">${body}</div>
  </body></html>`;
}

function renderPermissions(p) {
  const tools = (p.tools || []).map(escapeHtml).join(', ') || '—';
  const filesRead = (p.files?.read || []).map(escapeHtml).join(', ') || '—';
  const filesWrite = (p.files?.write || []).map(escapeHtml).join(', ') || '—';
  const net = (p.network?.allow || []).map(escapeHtml).join(', ') || '—';

  return `
    <details>
      <summary>Permissões</summary>
      <div class="muted" style="margin:8px 0 6px">Tools: <code>${tools}</code></div>
      <div class="muted" style="margin:6px 0">Ficheiros (ler): <code>${filesRead}</code></div>
      <div class="muted" style="margin:6px 0">Ficheiros (escrever): <code>${filesWrite}</code></div>
      <div class="muted" style="margin:6px 0">Rede: <code>${net}</code></div>
      <pre>${escapeHtml(JSON.stringify(p, null, 2))}</pre>
    </details>
  `;
}

app.get('/', (req, res) => {
  const pkgs = listAvailablePackages().map((p) => ManifestSchema.parse(p.manifest));
  const installed = new Set(listInstalledPackages().map((p) => p.name));

  const body = `
    <h1>Pacotes disponíveis</h1>
    <p class="muted">Instalações locais com permissões explícitas (v0). Sem execução automática.</p>
    <div class="grid">
      ${pkgs
        .map((m) => {
          const isInstalled = installed.has(m.name);
          const cap = m.capabilities.length ? m.capabilities.map(escapeHtml).join(', ') : '—';
          const desc = escapeHtml(m.description);
          const title = escapeHtml(m.displayName);
          const key = escapeHtml(m.name);
          const ver = escapeHtml(m.version);

          return `<div class="card">
            <div><strong>${title}</strong> <span class="muted">${key}@${ver}</span></div>
            <div class="muted">${desc}</div>
            <div class="muted">Capabilities: ${cap}</div>
            ${renderPermissions(m.permissions)}
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
              ${
                isInstalled
                  ? `<a class="btn secondary" href="/installed">Instalado ✓</a>`
                  : `<form method="POST" action="/install/${key}"><button class="btn" type="submit">Instalar</button></form>`
              }
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;
  res.send(page('Brad Bot Store', body));
});

app.get('/installed', (req, res) => {
  const pkgs = listInstalledPackages().map((p) => ManifestSchema.parse(p.manifest));
  const body = `
    <h1>Instalados</h1>
    <div class="grid">
      ${pkgs
        .map((m) => {
          const desc = escapeHtml(m.description);
          const title = escapeHtml(m.displayName);
          const key = escapeHtml(m.name);
          const ver = escapeHtml(m.version);
          return `<div class="card">
            <div><strong>${title}</strong> <span class="muted">${key}@${ver}</span></div>
            <div class="muted">${desc}</div>
            ${renderPermissions(m.permissions)}
            <form method="POST" action="/uninstall/${key}"><button class="btn secondary" type="submit">Desinstalar</button></form>
          </div>`;
        })
        .join('') || '<div class="card muted">Nada instalado.</div>'}
    </div>
  `;
  res.send(page('Instalados · Brad Bot Store', body));
});

app.post('/install/:name', (req, res) => {
  try {
    install(req.params.name);
  } catch {}
  res.redirect('/');
});

app.post('/uninstall/:name', (req, res) => {
  try {
    uninstall(req.params.name);
  } catch {}
  res.redirect('/installed');
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Brad Bot Store on http://localhost:${PORT}`);
});
