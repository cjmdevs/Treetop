const express = require('express');
const db      = require('../db/database');
const router  = express.Router();

function requireManagerOrAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'manager')
    return res.status(403).json({ error: 'Manager or admin access required.' });
  next();
}

// Staff rates are sensitive pay data — manager+ only (Settings module)
router.use(requireManagerOrAdmin);

// ── GET /api/staff-rates ─────────────────────────────────────────────────────
// Optional ?staff_member= filter; returns all history, newest-first per member.
router.get('/', (req, res) => {
  const { staff_member } = req.query;
  if (staff_member) {
    return res.json(
      db.prepare(
        'SELECT * FROM staff_rates WHERE staff_member = ? ORDER BY effective_date DESC'
      ).all(staff_member)
    );
  }
  res.json(
    db.prepare('SELECT * FROM staff_rates ORDER BY staff_member ASC, effective_date DESC').all()
  );
});

// ── GET /api/staff-rates/current ─────────────────────────────────────────────
// Returns the single most-recent rate row for every staff member.
router.get('/current', (req, res) => {
  const rates = db.prepare(`
    SELECT sr.*
    FROM staff_rates sr
    WHERE sr.effective_date = (
      SELECT MAX(s2.effective_date)
      FROM staff_rates s2
      WHERE s2.staff_member = sr.staff_member
    )
    ORDER BY sr.staff_member ASC
  `).all();
  res.json(rates);
});

// ── POST /api/staff-rates ────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { staff_member, hourly_rate, effective_date } = req.body;
  if (!staff_member || hourly_rate == null || !effective_date)
    return res.status(400).json({ error: 'staff_member, hourly_rate, effective_date required' });

  const r = db.prepare(
    'INSERT INTO staff_rates (staff_member, hourly_rate, effective_date) VALUES (?, ?, ?)'
  ).run(staff_member, parseFloat(hourly_rate), effective_date);

  res.status(201).json(
    db.prepare('SELECT * FROM staff_rates WHERE id = ?').get(r.lastInsertRowid)
  );
});

// ── DELETE /api/staff-rates/:id ──────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM staff_rates WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
