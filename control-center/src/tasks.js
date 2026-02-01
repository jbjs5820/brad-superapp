const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dayjs = require('dayjs');
const { db } = require('./db');

function nowIso() {
  return dayjs().toISOString();
}

function listTasks({ status = null, q = '' } = {}) {
  const where = [];
  const params = {};

  if (status) {
    where.push('status = @status');
    params.status = status;
  }

  if (q && q.trim()) {
    where.push('(title LIKE @q OR notes LIKE @q)');
    params.q = `%${q.trim()}%`;
  }

  const sql = `
    SELECT * FROM tasks
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
      CASE status
        WHEN 'inbox' THEN 1
        WHEN 'next' THEN 2
        WHEN 'scheduled' THEN 3
        WHEN 'waiting' THEN 4
        WHEN 'done' THEN 5
        ELSE 99
      END,
      priority ASC,
      COALESCE(due_date, '9999-12-31') ASC,
      updated_at DESC
  `;

  return db.prepare(sql).all(params);
}

function createTask({ title, status, priority = 2, due_date = null, notes = null, source = null }) {
  const ts = nowIso();
  const stmt = db.prepare(`
    INSERT INTO tasks (title, status, priority, due_date, notes, source, created_at, updated_at)
    VALUES (@title, @status, @priority, @due_date, @notes, @source, @created_at, @updated_at)
  `);
  const res = stmt.run({
    title,
    status,
    priority,
    due_date,
    notes,
    source,
    created_at: ts,
    updated_at: ts,
  });
  return res.lastInsertRowid;
}

function updateTask(id, patch) {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) return false;

  const merged = {
    ...existing,
    ...patch,
    updated_at: nowIso(),
  };

  db.prepare(`
    UPDATE tasks
    SET title=@title, status=@status, priority=@priority, due_date=@due_date, notes=@notes, source=@source, updated_at=@updated_at
    WHERE id=@id
  `).run(merged);

  return true;
}

function deleteTask(id) {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

function taskExistsByTitle(title) {
  const row = db.prepare('SELECT id FROM tasks WHERE title = ? LIMIT 1').get(title);
  return !!row;
}

function parseInboxMd(md) {
  // Very pragmatic parser: looks for markdown headings and bullet lines beginning with '- '
  // Maps headings to statuses.
  const lines = md.split(/\r?\n/);

  const sectionToStatus = {
    '📥 inbox (não triado)': 'inbox',
    '✅ próximas ações (triado)': 'next',
    '🗓️ agendado (criado no calendário)': 'scheduled',
    '⏳ aguardando (dependências)': 'waiting',
    '🧠 ideias / notas': 'inbox',
  };

  let currentStatus = null;
  const tasks = [];

  for (const raw of lines) {
    const line = raw.trim();

    const headingMatch = line.match(/^###\s+(.+)$/);
    if (headingMatch) {
      const h = headingMatch[1].trim().toLowerCase();
      currentStatus = sectionToStatus[h] || null;
      continue;
    }

    if (!currentStatus) continue;

    if (line.startsWith('- ')) {
      const title = line.slice(2).trim();
      if (!title) continue;
      tasks.push({ title, status: currentStatus, source: 'INBOX.md' });
    }
  }

  return tasks;
}

function importFromInboxMd(filePath) {
  const md = fs.readFileSync(filePath, 'utf8');
  const parsed = parseInboxMd(md);

  let imported = 0;
  let skipped = 0;
  const details = [];

  for (const t of parsed) {
    if (taskExistsByTitle(t.title)) {
      skipped += 1;
      details.push({ title: t.title, status: t.status, action: 'skipped' });
      continue;
    }
    createTask({ ...t, priority: 2 });
    imported += 1;
    details.push({ title: t.title, status: t.status, action: 'imported' });
  }

  return { imported, skipped, details };
}

function getGitInfo(repoDir) {
  try {
    const hash = execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoDir }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: repoDir }).toString().trim().length > 0;
    return { branch, hash, dirty };
  } catch {
    return { error: 'not a git repo or git unavailable' };
  }
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  importFromInboxMd,
  getGitInfo,
};
