const express = require('express');
const db = require('../db/database');
const router = express.Router();

// GET /api/project-statuses — list all (active first, then inactive)
router.get('/', (req, res) => {
  const { include_inactive } = req.query;
  const rows = include_inactive === 'true'
    ? db.prepare('SELECT * FROM project_statuses ORDER BY sort_order ASC, label ASC').all()
    : db.prepare('SELECT * FROM project_statuses WHERE is_active = 1 ORDER BY sort_order ASC, label ASC').all();
  res.json(rows);
});

// POST /api/project-statuses — create
router.post('/', (req, res) => {
  const { label, color, sort_order, is_default } = req.body;
  if (!label) return res.status(400).json({ error: 'label required' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM project_statuses').get().next;
  const r = db.prepare(`
    INSERT INTO project_statuses (label, color, sort_order, is_active, is_default)
    VALUES (?, ?, ?, 1, ?)
  `).run(label.trim(), color || '#6B7280', sort_order ?? maxOrder, is_default ? 1 : 0);
  if (is_default) db.prepare('UPDATE project_statuses SET is_default=0 WHERE id != ?').run(r.lastInsertRowid);
  res.status(201).json(db.prepare('SELECT * FROM project_statuses WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/project-statuses/:id — update
router.put('/:id', (req, res) => {
  const { label, color, sort_order, is_active, is_default } = req.body;
  const prev = db.prepare('SELECT * FROM project_statuses WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE project_statuses SET label=?, color=?, sort_order=?, is_active=?, is_default=? WHERE id=?
  `).run(
    label ?? prev.label,
    color ?? prev.color,
    sort_order !== undefined ? sort_order : prev.sort_order,
    is_active !== undefined ? (is_active ? 1 : 0) : prev.is_active,
    is_default !== undefined ? (is_default ? 1 : 0) : prev.is_default,
    req.params.id
  );
  if (is_default) db.prepare('UPDATE project_statuses SET is_default=0 WHERE id != ?').run(req.params.id);
  res.json(db.prepare('SELECT * FROM project_statuses WHERE id = ?').get(req.params.id));
});

// PATCH /api/project-statuses/reorder — bulk sort_order update
router.patch('/reorder', (req, res) => {
  const { order } = req.body; // array of { id, sort_order }
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  const stmt = db.prepare('UPDATE project_statuses SET sort_order=? WHERE id=?');
  order.forEach(({ id, sort_order }) => stmt.run(sort_order, id));
  res.json({ ok: true });
});

// DELETE /api/project-statuses/:id — only if no projects use it
router.delete('/:id', (req, res) => {
  const status = db.prepare('SELECT * FROM project_statuses WHERE id = ?').get(req.params.id);
  if (!status) return res.status(404).json({ error: 'Not found' });

  const inUse = db.prepare('SELECT COUNT(*) as n FROM projects WHERE status = ?').get(status.label);
  if (inUse.n > 0) {
    return res.status(409).json({
      error: `Cannot delete — ${inUse.n} project(s) use this status. Deactivate it instead or reassign first.`,
      in_use: inUse.n,
    });
  }
  db.prepare('DELETE FROM project_statuses WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

module.exports = router;
