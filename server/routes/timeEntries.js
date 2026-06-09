const express = require('express');
const db      = require('../db/database');
const router  = express.Router();
const { log }                    = require('../lib/activityLogger');
const { runBudgetCheck }         = require('../lib/automationEngine');
const { findPeriodIdForDate }    = require('./payPeriods');

// ── GET /api/time-entries ─────────────────────────────────────────────────────
// Filters: engagement_id, staff_member, date_from, date_to,
//          pay_period_id, billable, entry_status, service_code
router.get('/', (req, res) => {
  const {
    engagement_id, project_id, staff_member,
    date_from, date_to,
    pay_period_id, billable, entry_status, service_code,
  } = req.query;

  let query = `
    SELECT t.*, e.client_name, e.engagement_type
    FROM time_entries t
    JOIN engagements e ON t.engagement_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (engagement_id) { query += ' AND t.engagement_id = ?';   params.push(engagement_id); }
  if (project_id)    { query += ' AND t.project_id = ?';      params.push(project_id); }
  // Non-admin (staff AND manager) always see only their own entries — the
  // staff_member query param is intentionally ignored for non-admins so it
  // cannot be used to read another user's time history.
  if (req.user.role !== 'admin') {
    query += ' AND t.staff_member = ?';
    params.push(req.user.full_name);
  } else if (staff_member) {
    // Admin only: optional cross-user filter via query param
    query += ' AND t.staff_member = ?';
    params.push(staff_member);
  }
  if (date_from)     { query += ' AND t.date >= ?';           params.push(date_from); }
  if (date_to)       { query += ' AND t.date <= ?';           params.push(date_to); }
  if (pay_period_id) { query += ' AND t.pay_period_id = ?';   params.push(pay_period_id); }
  if (billable != null && billable !== '')
                     { query += ' AND t.billable = ?';        params.push(billable === 'true' || billable === '1' ? 1 : 0); }
  if (entry_status)  { query += ' AND t.entry_status = ?';    params.push(entry_status); }
  if (service_code)  { query += ' AND t.service_code = ?';    params.push(service_code); }

  query += ' ORDER BY t.date DESC, t.id DESC';
  res.json(db.prepare(query).all(...params));
});

// ── POST /api/time-entries ────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    engagement_id, date, hours,
    billing_rate, notes, billable, service_code,
    internal_memo, entry_status,
  } = req.body;

  // Always assigned to the authenticated user — body.staff_member is ignored
  const staff_member = req.user.full_name;
  const user_id      = req.user.id;

  const pay_period_id = findPeriodIdForDate(date);

  // resolve effective rate: submitted rate → staff rate → user default
  let effectiveRate = (billing_rate != null && billing_rate !== '') ? Number(billing_rate) : null
  if (!effectiveRate) {
    const sr = db.prepare(
      `SELECT hourly_rate FROM staff_rates WHERE staff_member = ? ORDER BY effective_date DESC LIMIT 1`
    ).get(staff_member)
    effectiveRate = sr?.hourly_rate || req.user.default_hourly_rate || null
  }

  const result = db.prepare(`
    INSERT INTO time_entries
      (engagement_id, staff_member, user_id, date, hours, billing_rate, notes,
       billable, service_code, pay_period_id, internal_memo, entry_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    engagement_id, staff_member, user_id, date, hours,
    effectiveRate,
    notes         || null,
    billable ? 1 : 0,
    service_code  || null,
    pay_period_id,
    internal_memo ? 1 : 0,
    entry_status  || 'draft'
  );

  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid);
  log('time_entry_added', 'engagement', engagement_id,
      `${hours}h logged by ${staff_member}`, staff_member, req.user.full_name);
  runBudgetCheck(engagement_id);
  res.status(201).json(entry);
});

// ── PUT /api/time-entries/:id ─────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const entry = db.prepare('SELECT user_id FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });

  const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';

  if (!isAdminOrManager && Number(entry.user_id) !== Number(req.user.id))
    return res.status(403).json({ error: 'You can only edit your own time entries.' });

  const {
    engagement_id, staff_member, date, hours,
    billing_rate, notes, billable, service_code,
    internal_memo, entry_status,
  } = req.body;

  // Non-admin/manager cannot escalate entry_status to 'released' via PUT.
  // Released status must go through the dedicated PATCH /:id/status route.
  if (!isAdminOrManager && entry_status === 'released')
    return res.status(403).json({ error: 'Only admin or manager can set entry status to released.' });

  // Re-assign pay period if the date changed
  const pay_period_id = date ? findPeriodIdForDate(date) : null;

  db.prepare(`
    UPDATE time_entries
    SET engagement_id=?, staff_member=?, date=?, hours=?,
        billing_rate=?, notes=?, billable=?, service_code=?,
        pay_period_id=?, internal_memo=?, entry_status=?
    WHERE id=?
  `).run(
    engagement_id, staff_member, date, hours,
    billing_rate  || null,
    notes         || null,
    billable ? 1 : 0,
    service_code  || null,
    pay_period_id,
    internal_memo ? 1 : 0,
    entry_status  || 'draft',
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id));
});

// ── DELETE /api/time-entries/:id ──────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const entry = db.prepare('SELECT user_id FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });

  const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';
  if (!isAdminOrManager && Number(entry.user_id) !== Number(req.user.id))
    return res.status(403).json({ error: 'You can only delete your own time entries.' });

  db.prepare('DELETE FROM time_entries WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// ── PATCH /api/time-entries/bulk ──────────────────────────────────────────────
// Bulk-update billable flag on multiple entries.
router.patch('/bulk', (req, res) => {
  const { ids, billable } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'ids required' });

  const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';
  if (!isAdminOrManager) {
    // Staff: verify every requested entry belongs to them before applying any change.
    const placeholders = ids.map(() => '?').join(',');
    const entries = db.prepare(
      `SELECT user_id FROM time_entries WHERE id IN (${placeholders})`
    ).all(...ids);
    if (entries.some(e => Number(e.user_id) !== Number(req.user.id)))
      return res.status(403).json({ error: 'You can only modify your own time entries.' });
  }

  const stmt = db.prepare('UPDATE time_entries SET billable=? WHERE id=?');
  ids.forEach(id => stmt.run(billable ? 1 : 0, id));
  res.json({ updated: ids.length });
});

// ── PATCH /api/time-entries/:id/status ───────────────────────────────────────
// Advance entry_status: draft → submitted → released
// Released status is admin/manager only — staff cannot approve their own time.
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const valid = ['draft', 'submitted', 'released'];
  if (!valid.includes(status))
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });

  const entry = db.prepare('SELECT user_id FROM time_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });

  const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';

  // Role gate: only admin/manager may set status to 'released'
  if (status === 'released' && !isAdminOrManager)
    return res.status(403).json({ error: 'Only admin or manager can release time entries.' });

  // Ownership gate: non-admin/manager may only touch their own entries.
  // Number() coercion guards against BigInt vs number mismatches from the DB/JWT boundary.
  if (!isAdminOrManager && Number(entry.user_id) !== Number(req.user.id))
    return res.status(403).json({ error: 'You can only update your own time entries.' });

  db.prepare('UPDATE time_entries SET entry_status=? WHERE id=?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id));
});

module.exports = router;
