const dayjs = require('dayjs');
const { db } = require('./db');

function nowIso() {
  return dayjs().toISOString();
}

function normalizeTags(tags) {
  if (!tags) return '';
  // comma/space separated -> canonical comma list
  const parts = String(tags)
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  // de-dupe (case-insensitive)
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join(', ');
}

function createMemory({ title, body, tags = '' }) {
  const ts = nowIso();
  const stmt = db.prepare(`
    INSERT INTO memories (title, body, tags, created_at, updated_at)
    VALUES (@title, @body, @tags, @created_at, @updated_at)
  `);
  const res = stmt.run({
    title: String(title || '').trim(),
    body: String(body || '').trim(),
    tags: normalizeTags(tags),
    created_at: ts,
    updated_at: ts,
  });
  return res.lastInsertRowid;
}

function getMemory(id) {
  return db.prepare('SELECT * FROM memories WHERE id = ?').get(Number(id));
}

function listMemories({ limit = 50 } = {}) {
  return db
    .prepare(
      `SELECT * FROM memories
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(Number(limit));
}

function searchMemories({ q = '', limit = 50 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];

  // FTS5 query: add * for prefix matches on single tokens
  // Keep it simple; escape quotes.
  const safe = query.replace(/"/g, '');
  const fts = safe
    .split(/\s+/g)
    .filter(Boolean)
    .map((t) => (t.length >= 3 ? `${t}*` : t))
    .join(' ');

  const sql = `
    SELECT m.*, bm25(memories_fts) as rank
    FROM memories_fts
    JOIN memories m ON m.id = memories_fts.rowid
    WHERE memories_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `;

  return db.prepare(sql).all(fts, Number(limit));
}

function listMemoriesByTag({ tag = '', limit = 50 } = {}) {
  const t = String(tag || '').trim().toLowerCase();
  if (!t) return [];
  return db
    .prepare(
      `SELECT * FROM memories
       WHERE lower(tags) LIKE ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(`%${t}%`, Number(limit));
}

module.exports = { createMemory, getMemory, listMemories, listMemoriesByTag, searchMemories, normalizeTags };
