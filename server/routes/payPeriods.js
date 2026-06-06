const express = require('express');
const db      = require('../db/database');
const router  = express.Router();

// ── Helper exported for use in timeEntries.js ────────────────────────────────
function findPeriodIdForDate(date) {
  const row = db.prepare(
    'SELECT id FROM pay_periods WHERE start_date <= ? AND end_date >= ?'
  ).get(date, date);
  return row ? row.id : null;
}

// ── GET /api/pay-periods ─────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { year } = req.query;
  let sql    = 'SELECT * FROM pay_periods';
  const args = [];
  if (year) { sql += ' WHERE year = ?'; args.push(parseInt(year, 10)); }
  sql += ' ORDER BY year ASC, period_number ASC';
  res.json(db.prepare(sql).all(...args));
});

// ── GET /api/pay-periods/current ─────────────────────────────────────────────
router.get('/current', (req, res) => {
  const today  = new Date().toISOString().split('T')[0];
  const period = db.prepare(
    'SELECT * FROM pay_periods WHERE start_date <= ? AND end_date >= ?'
  ).get(today, today);
  res.json(period || null);
});

// ── GET /api/pay-periods/my-summary ─────────────────────────────────────────
router.get('/my-summary', (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const rows = db.prepare(`
    SELECT pp.id, pp.period_number, pp.year, pp.start_date, pp.end_date,
      COALESCE(ppus.status, 'Open') as user_status,
      ppus.released_at,
      COALESCE(SUM(te.hours), 0) as total_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours ELSE 0 END), 0) as billable_hours,
      COALESCE(SUM(CASE WHEN te.billable=0 THEN te.hours ELSE 0 END), 0) as nonbillable_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END), 0) as billable_amount
    FROM pay_periods pp
    LEFT JOIN pay_period_user_status ppus
      ON ppus.pay_period_id = pp.id AND ppus.user_id = ?
    LEFT JOIN time_entries te
      ON te.pay_period_id = pp.id AND te.user_id = ?
    WHERE pp.year = ?
    GROUP BY pp.id
    ORDER BY pp.period_number DESC
  `).all(req.user.id, req.user.id, year);
  res.json(rows);
});

// ── GET /api/pay-periods/:id/my-status ──────────────────────────────────────
router.get('/:id/my-status', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM pay_period_user_status WHERE pay_period_id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  res.json(row || { pay_period_id: parseInt(req.params.id), user_id: req.user.id, status: 'Open' });
});

// ── POST /api/pay-periods/:id/release-my-time ────────────────────────────────
router.post('/:id/release-my-time', (req, res) => {
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  db.prepare(`
    INSERT INTO pay_period_user_status (pay_period_id, user_id, status, released_at)
    VALUES (?, ?, 'Released', ?)
    ON CONFLICT(pay_period_id, user_id) DO UPDATE SET status='Released', released_at=excluded.released_at
  `).run(req.params.id, req.user.id, new Date().toISOString());

  res.json({ pay_period_id: parseInt(req.params.id), user_id: req.user.id, status: 'Released' });
});

// ── GET /api/pay-periods/:id/all-user-statuses ───────────────────────────────
router.get('/:id/all-user-statuses', (req, res) => {
  if (req.user.role === 'staff') return res.status(403).json({ error: 'Forbidden' });

  const usersWithEntries = db.prepare(`
    SELECT DISTINCT u.id, u.full_name
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.pay_period_id = ?
  `).all(req.params.id);

  const statuses = usersWithEntries.map(u => {
    const row = db.prepare(
      'SELECT status, released_at FROM pay_period_user_status WHERE pay_period_id = ? AND user_id = ?'
    ).get(req.params.id, u.id);
    return { user_id: u.id, full_name: u.full_name, status: row?.status || 'Open', released_at: row?.released_at || null };
  });

  res.json(statuses);
});

// ── GET /api/pay-periods/:id/staff-summary ───────────────────────────────────
router.get('/:id/staff-summary', (req, res) => {
  if (req.user.role === 'staff') return res.status(403).json({ error: 'Forbidden' });

  const rows = db.prepare(`
    SELECT u.id as user_id, u.full_name,
      COALESCE(ppus.status, 'Open') as user_status,
      ppus.released_at,
      COALESCE(SUM(te.hours), 0) as total_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours ELSE 0 END), 0) as billable_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END), 0) as billable_amount
    FROM users u
    LEFT JOIN pay_period_user_status ppus
      ON ppus.pay_period_id = ? AND ppus.user_id = u.id
    LEFT JOIN time_entries te
      ON te.pay_period_id = ? AND te.user_id = u.id
    WHERE u.active = 1 AND u.role IN ('admin', 'manager', 'staff')
    GROUP BY u.id
    HAVING total_hours > 0 OR ppus.status IS NOT NULL
    ORDER BY u.full_name
  `).all(req.params.id, req.params.id);
  res.json(rows);
});

// ── POST /api/pay-periods/:id/release-user/:userId ───────────────────────────
router.post('/:id/release-user/:userId', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const period = db.prepare('SELECT id FROM pay_periods WHERE id = ?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  db.prepare(`
    INSERT INTO pay_period_user_status (pay_period_id, user_id, status, released_at)
    VALUES (?, ?, 'Released', ?)
    ON CONFLICT(pay_period_id, user_id)
    DO UPDATE SET status='Released', released_at=excluded.released_at
  `).run(req.params.id, req.params.userId, new Date().toISOString());

  res.json({
    pay_period_id: parseInt(req.params.id),
    user_id: parseInt(req.params.userId),
    status: 'Released',
  });
});

// ── POST /api/pay-periods/:id/bulk-release ───────────────────────────────────
router.post('/:id/bulk-release', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const users = db.prepare(
    'SELECT DISTINCT user_id FROM time_entries WHERE pay_period_id = ?'
  ).all(req.params.id);

  const upsert = db.prepare(`
    INSERT INTO pay_period_user_status (pay_period_id, user_id, status, released_at)
    VALUES (?, ?, 'Released', ?)
    ON CONFLICT(pay_period_id, user_id)
    DO UPDATE SET status='Released', released_at=excluded.released_at
  `);

  const now = new Date().toISOString();
  db.transaction(() => {
    users.forEach(u => upsert.run(req.params.id, u.user_id, now));
  })();

  res.json({ released: users.length, period_id: parseInt(req.params.id) });
});

// ── POST /api/pay-periods/:id/unrelease-user/:userId ─────────────────────────
router.post('/:id/unrelease-user/:userId', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  db.prepare(`
    INSERT INTO pay_period_user_status (pay_period_id, user_id, status, released_at)
    VALUES (?, ?, 'Open', NULL)
    ON CONFLICT(pay_period_id, user_id) DO UPDATE SET status='Open', released_at=NULL
  `).run(req.params.id, req.params.userId);

  res.json({ pay_period_id: parseInt(req.params.id), user_id: parseInt(req.params.userId), status: 'Open' });
});

// ── GET /api/pay-periods/:id ─────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// ── POST /api/pay-periods/generate ──────────────────────────────────────────
// Generates 26 biweekly periods for the given year starting on the
// first Monday on or after Jan 1.
router.post('/generate', (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'manager')
    return res.status(403).json({ error: 'Admin or manager access required.' });

  const year = parseInt(req.body.year, 10);
  if (!year) return res.status(400).json({ error: 'year required' });

  // Find the first Monday of the year
  const jan1       = new Date(year, 0, 1);
  const dow        = jan1.getDay(); // 0=Sun … 6=Sat
  const daysToMon  = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow);
  let   start      = new Date(year, 0, 1 + daysToMon);

  const insert = db.prepare(
    'INSERT OR IGNORE INTO pay_periods (period_number, year, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)'
  );

  const generated = [];
  db.transaction(() => {
    for (let p = 1; p <= 26; p++) {
      const end      = new Date(start);
      end.setDate(end.getDate() + 13);           // 14 days inclusive
      const startStr = start.toISOString().split('T')[0];
      const endStr   = end.toISOString().split('T')[0];
      insert.run(p, year, startStr, endStr, 'Open');
      generated.push({ period_number: p, year, start_date: startStr, end_date: endStr, status: 'Open' });
      start = new Date(end);
      start.setDate(start.getDate() + 1);
    }
  })();

  res.status(201).json({ generated: generated.length, periods: generated });
});

// ── PATCH /api/pay-periods/:id/status ────────────────────────────────────────
router.patch('/:id/status', (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'manager')
    return res.status(403).json({ error: 'Admin or manager access required.' });

  const { status, released_by } = req.body;
  const valid = ['Open', 'Submitted', 'Released', 'Locked'];
  if (!valid.includes(status))
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });

  const isRelease = status === 'Released';
  const r = db.prepare(
    'UPDATE pay_periods SET status=?, released_by=?, released_at=? WHERE id=?'
  ).run(
    status,
    isRelease ? (released_by || null) : null,
    isRelease ? new Date().toISOString() : null,
    req.params.id
  );

  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.id));
});

// ── POST /api/pay-periods/:id/submit ─────────────────────────────────────────
// Bulk-sets entry_status = 'submitted' for draft entries in the period.
// Staff may only submit their own entries. Admin/manager may pass { staff_member }
// to limit to one person, or omit to submit all staff in the period.
router.post('/:id/submit', (req, res) => {
  const { staff_member } = req.body || {};
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';

  // Staff are always locked to their own entries regardless of what staff_member was passed.
  const effectiveStaff = isAdminOrManager ? (staff_member || null) : req.user.full_name;

  let sql    = "UPDATE time_entries SET entry_status='submitted' WHERE pay_period_id=? AND entry_status='draft'";
  const args = [period.id];
  if (effectiveStaff) { sql += ' AND staff_member=?'; args.push(effectiveStaff); }

  const r = db.prepare(sql).run(...args);
  res.json({ updated: r.changes, period_id: period.id, staff_member: effectiveStaff });
});

// ── POST /api/pay-periods/:id/release ────────────────────────────────────────
// Bulk-sets entry_status = 'released' for draft+submitted entries in the period.
// Optional body: { staff_member, released_by }
// Auto-updates period status to Released when all entries are released.
// Admin/manager only — staff cannot approve time.
router.post('/:id/release', (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'manager')
    return res.status(403).json({ error: 'Admin or manager access required.' });

  const { staff_member, released_by } = req.body || {};
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  let sql    = "UPDATE time_entries SET entry_status='released' WHERE pay_period_id=? AND entry_status IN ('draft','submitted')";
  const args = [period.id];
  if (staff_member) { sql += ' AND staff_member=?'; args.push(staff_member); }

  const r = db.prepare(sql).run(...args);

  // If all entries in the period are now released, auto-promote period status
  const remaining = db.prepare(
    "SELECT COUNT(*) AS cnt FROM time_entries WHERE pay_period_id=? AND entry_status != 'released'"
  ).get(period.id);

  if (remaining.cnt === 0 && r.changes > 0) {
    db.prepare("UPDATE pay_periods SET status='Released', released_by=?, released_at=? WHERE id=?")
      .run(released_by || 'Manager', new Date().toISOString(), period.id);
  }

  res.json({ updated: r.changes, period_id: period.id, staff_member: staff_member || null });
});

module.exports        = router;
module.exports.findPeriodIdForDate = findPeriodIdForDate;
