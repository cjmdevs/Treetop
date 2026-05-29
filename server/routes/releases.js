const express = require('express');
const db      = require('../db/database');
const router  = express.Router();

// GET /api/releases — staff sees own, admin/manager sees all
router.get('/', (req, res) => {
  if (req.user.role === 'staff') {
    return res.json(db.prepare(`
      SELECT tr.*, u.full_name
      FROM time_releases tr
      JOIN users u ON u.id = tr.user_id
      WHERE tr.user_id = ?
      ORDER BY tr.released_at DESC
    `).all(req.user.id));
  }
  res.json(db.prepare(`
    SELECT tr.*, u.full_name
    FROM time_releases tr
    JOIN users u ON u.id = tr.user_id
    ORDER BY tr.released_at DESC
  `).all());
});

// POST /api/releases/preview — hours + amount for a date range (current user)
router.post('/preview', (req, res) => {
  const { start_date, end_date } = req.body;
  if (!start_date || !end_date)
    return res.status(400).json({ error: 'start_date and end_date required' });

  // Match entries by user_id (API-created entries) OR by staff_member name (seeded entries
  // where user_id was NULL because the seed ran before users were inserted).
  const sql = `
    SELECT
      COALESCE(SUM(hours), 0)                                                        AS total_hours,
      COALESCE(SUM(CASE WHEN billable=1 THEN hours * COALESCE(billing_rate,0) ELSE 0 END), 0) AS total_amount,
      COUNT(*)                                                                       AS entry_count
    FROM time_entries
    WHERE (user_id = ? OR (user_id IS NULL AND staff_member = ?))
      AND date BETWEEN ? AND ?
      AND NOT EXISTS (
        SELECT 1 FROM time_releases tr
        WHERE tr.user_id = ?
          AND time_entries.date BETWEEN tr.start_date AND tr.end_date
      )
  `;
  const params = [req.user.id, req.user.full_name, start_date, end_date, req.user.id];
  console.log('[releases/preview] sql params:', { user_id: req.user.id, staff_member: req.user.full_name, start_date, end_date });
  const row = db.prepare(sql).get(...params);
  console.log('[releases/preview] result:', row);

  res.json({ start_date, end_date, ...row });
});

// POST /api/releases — create a release snapshot
router.post('/', (req, res) => {
  const { start_date, end_date } = req.body;
  if (!start_date || !end_date)
    return res.status(400).json({ error: 'start_date and end_date required' });

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(hours), 0)                                                        AS total_hours,
      COALESCE(SUM(CASE WHEN billable=1 THEN hours * COALESCE(billing_rate,0) ELSE 0 END), 0) AS total_amount
    FROM time_entries
    WHERE (user_id = ? OR (user_id IS NULL AND staff_member = ?))
      AND date BETWEEN ? AND ?
      AND NOT EXISTS (
        SELECT 1 FROM time_releases tr
        WHERE tr.user_id = ?
          AND time_entries.date BETWEEN tr.start_date AND tr.end_date
      )
  `).get(req.user.id, req.user.full_name, start_date, end_date, req.user.id);

  const result = db.prepare(`
    INSERT INTO time_releases (user_id, start_date, end_date, total_hours, total_amount)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, start_date, end_date, totals.total_hours, totals.total_amount);

  const release = db.prepare(`
    SELECT tr.*, u.full_name
    FROM time_releases tr JOIN users u ON u.id = tr.user_id
    WHERE tr.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(release);
});

// DELETE /api/releases/:id — admin only
router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM time_releases WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
