const express = require('express');
const db      = require('../db/database');
const router  = express.Router();

const COLS = 'id, code, description, number, category, subcategory, default_rate, billable_default, active';

// ── GET /api/service-codes ────────────────────────────────────────────────────
// ?include_inactive=true to include deactivated codes.
router.get('/', (req, res) => {
  const all = req.query.include_inactive === 'true';
  const sql = all
    ? `SELECT ${COLS} FROM service_codes ORDER BY code ASC`
    : `SELECT ${COLS} FROM service_codes WHERE active = 1 ORDER BY code ASC`;
  res.json(db.prepare(sql).all());
});

// ── POST /api/service-codes ──────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { code, description, number, category, subcategory, default_rate, billable_default } = req.body;
  if (!code || !description)
    return res.status(400).json({ error: 'code and description required' });
  try {
    const r = db.prepare(`
      INSERT INTO service_codes
        (code, description, number, category, subcategory, default_rate, billable_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      code,
      description,
      number        || null,
      category      || 'Other',
      subcategory   || null,
      default_rate  != null ? parseFloat(default_rate) : null,
      billable_default != null ? (billable_default ? 1 : 0) : 1
    );
    res.status(201).json(
      db.prepare(`SELECT ${COLS} FROM service_codes WHERE id = ?`).get(r.lastInsertRowid)
    );
  } catch {
    res.status(409).json({ error: 'Code already exists' });
  }
});

// ── PUT /api/service-codes/:id ────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { code, description, number, category, subcategory, default_rate, billable_default } = req.body;
  if (!code || !description)
    return res.status(400).json({ error: 'code and description required' });
  try {
    const r = db.prepare(`
      UPDATE service_codes
      SET code=?, description=?, number=?, category=?, subcategory=?, default_rate=?, billable_default=?
      WHERE id=?
    `).run(
      code,
      description,
      number        || null,
      category      || 'Other',
      subcategory   || null,
      default_rate  != null ? parseFloat(default_rate) : null,
      billable_default != null ? (billable_default ? 1 : 0) : 1,
      req.params.id
    );
    if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare(`SELECT ${COLS} FROM service_codes WHERE id = ?`).get(req.params.id));
  } catch {
    res.status(409).json({ error: 'Code already exists' });
  }
});

// ── PATCH /api/service-codes/:id/toggle ──────────────────────────────────────
// Flips the active flag (deactivate / reactivate).
router.patch('/:id/toggle', (req, res) => {
  const sc = db.prepare('SELECT id, active FROM service_codes WHERE id = ?').get(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE service_codes SET active = ? WHERE id = ?').run(sc.active ? 0 : 1, sc.id);
  res.json(db.prepare(`SELECT ${COLS} FROM service_codes WHERE id = ?`).get(sc.id));
});

// ── DELETE /api/service-codes/:id ────────────────────────────────────────────
// Refuses deletion if the code is referenced by any time entry; deactivate instead.
router.delete('/:id', (req, res) => {
  const sc = db.prepare('SELECT code FROM service_codes WHERE id = ?').get(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });

  const inUse = db.prepare(
    'SELECT COUNT(*) AS cnt FROM time_entries WHERE service_code = ?'
  ).get(sc.code);

  if (inUse.cnt > 0)
    return res.status(409).json({
      error: 'Service code is referenced by time entries. Deactivate instead.',
    });

  db.prepare('DELETE FROM service_codes WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

module.exports = router;
