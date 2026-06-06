const express = require('express');
const db      = require('../db/database');
const router  = express.Router();

// ── GET /api/time-summary/mtd ─────────────────────────────────────────────────
// Month-to-date hours: totals, per-staff, per-category breakdown.
// Admin: optional ?staff=Name to filter to one person.
// Non-admin: always scoped to the caller — ?staff= param is ignored to prevent
//            reading another user's MTD data (same rule as C3 GET /time-entries).
router.get('/mtd', (req, res) => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const start = `${year}-${month}-01`;
  const end   = now.toISOString().split('T')[0];

  // Force self-scope for non-admin callers.
  const effectiveStaff = req.user.role === 'admin'
    ? (req.query.staff || null)
    : req.user.full_name;

  const whereClause = effectiveStaff
    ? 'WHERE date >= ? AND date <= ? AND staff_member = ?'
    : 'WHERE date >= ? AND date <= ?';
  const args = effectiveStaff ? [start, end, effectiveStaff] : [start, end];

  const byStaff = db.prepare(`
    SELECT staff_member,
           SUM(hours)                                                           AS total_hours,
           SUM(CASE WHEN billable=1 THEN hours ELSE 0 END)                     AS billable_hours,
           SUM(CASE WHEN billable=0 THEN hours ELSE 0 END)                     AS nonbillable_hours,
           SUM(CASE WHEN billable=1 THEN hours * billing_rate ELSE 0 END)      AS billable_amount,
           COUNT(*)                                                             AS entry_count
    FROM time_entries
    ${whereClause}
    GROUP BY staff_member
    ORDER BY total_hours DESC
  `).all(...args);

  // Breakdown by service code category
  const byCategory = db.prepare(`
    SELECT COALESCE(sc.category, 'Uncategorized')                              AS category,
           SUM(t.hours)                                                         AS total_hours,
           SUM(CASE WHEN t.billable=1 THEN t.hours ELSE 0 END)                 AS billable_hours,
           SUM(CASE WHEN t.billable=1 THEN t.hours * t.billing_rate ELSE 0 END) AS billable_amount
    FROM time_entries t
    LEFT JOIN service_codes sc ON sc.code = t.service_code
    ${whereClause}
    GROUP BY COALESCE(sc.category, 'Uncategorized')
    ORDER BY total_hours DESC
  `).all(...args);

  const totals = db.prepare(`
    SELECT SUM(hours)                                                           AS total_hours,
           SUM(CASE WHEN billable=1 THEN hours ELSE 0 END)                     AS billable_hours,
           SUM(CASE WHEN billable=0 THEN hours ELSE 0 END)                     AS nonbillable_hours,
           SUM(CASE WHEN billable=1 THEN hours * billing_rate ELSE 0 END)      AS billable_amount
    FROM time_entries
    ${whereClause}
  `).get(...args);

  res.json({ period: { start, end }, totals, byStaff, byCategory });
});

// ── GET /api/time-summary/period/:periodId ────────────────────────────────────
// Biweekly timesheet grid with billable totals + per-staff entry status.
// Admin only — exposes all staff hours and billable amounts across the firm.
router.get('/period/:periodId', (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required.' });
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.periodId);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  // Build the array of dates in the period (timezone-safe)
  const dates = [];
  const cur   = new Date(period.start_date + 'T12:00:00');
  const endD  = new Date(period.end_date   + 'T12:00:00');
  while (cur <= endD) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  // Raw entries — include billable totals per staff+day
  const entries = db.prepare(`
    SELECT t.staff_member, t.date,
           SUM(t.hours)                                                          AS hours,
           SUM(CASE WHEN t.billable=1 THEN t.hours ELSE 0 END)                  AS billable_hours,
           SUM(CASE WHEN t.billable=1 THEN t.hours * t.billing_rate ELSE 0 END) AS billable_amount
    FROM time_entries t
    WHERE t.pay_period_id = ?
    GROUP BY t.staff_member, t.date
    ORDER BY t.staff_member ASC, t.date ASC
  `).all(period.id);

  // Group into staff rows
  const staffMap = {};
  entries.forEach(({ staff_member, date, hours, billable_hours, billable_amount }) => {
    if (!staffMap[staff_member]) {
      staffMap[staff_member] = {
        staff_member, daily: {}, total: 0,
        billable_hours: 0, billable_amount: 0,
      };
    }
    staffMap[staff_member].daily[date]        = (staffMap[staff_member].daily[date] || 0) + hours;
    staffMap[staff_member].total             += hours;
    staffMap[staff_member].billable_hours    += billable_hours;
    staffMap[staff_member].billable_amount   += billable_amount;
  });

  // Per-staff entry status (worst-case: if any draft → Open)
  const statusRows = db.prepare(`
    SELECT staff_member,
           MAX(CASE entry_status WHEN 'draft'     THEN 1
                                 WHEN 'submitted' THEN 2
                                 WHEN 'released'  THEN 3
                                 ELSE 0 END) AS max_status,
           MIN(CASE entry_status WHEN 'draft'     THEN 1
                                 WHEN 'submitted' THEN 2
                                 WHEN 'released'  THEN 3
                                 ELSE 0 END) AS min_status
    FROM time_entries
    WHERE pay_period_id = ?
    GROUP BY staff_member
  `).all(period.id);

  const STATUS_MAP = { 1: 'Open', 2: 'Submitted', 3: 'Released' };
  statusRows.forEach(({ staff_member, min_status }) => {
    if (staffMap[staff_member]) {
      staffMap[staff_member].entry_status = STATUS_MAP[min_status] || 'Open';
    }
  });

  // Column totals (hours per day across all staff)
  const colTotals = {};
  dates.forEach(d => { colTotals[d] = 0; });
  Object.values(staffMap).forEach(row => {
    dates.forEach(d => { colTotals[d] = (colTotals[d] || 0) + (row.daily[d] || 0); });
  });

  // Period-level totals
  const periodTotals = db.prepare(`
    SELECT SUM(hours)                                                            AS total_hours,
           SUM(CASE WHEN billable=1 THEN hours ELSE 0 END)                      AS billable_hours,
           SUM(CASE WHEN billable=0 THEN hours ELSE 0 END)                      AS nonbillable_hours,
           SUM(CASE WHEN billable=1 THEN hours * billing_rate ELSE 0 END)       AS billable_amount
    FROM time_entries WHERE pay_period_id = ?
  `).get(period.id);

  res.json({
    period,
    dates,
    staffRows:    Object.values(staffMap),
    colTotals,
    periodTotals: periodTotals || { total_hours: 0, billable_hours: 0, nonbillable_hours: 0, billable_amount: 0 },
  });
});

// ── GET /api/time-summary/alerts ──────────────────────────────────────────────
// Returns: unreleased past periods, staff with low hours, missing staff, over-budget engagements.
// Admin only — exposes firm-wide data about all staff, not just the caller.
router.get('/alerts', (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required.' });
  const today = new Date().toISOString().split('T')[0];

  const unreleasedPeriods = db.prepare(`
    SELECT * FROM pay_periods
    WHERE end_date < ? AND status NOT IN ('Released', 'Locked')
    ORDER BY end_date DESC
  `).all(today);

  const currentPeriod = db.prepare(
    'SELECT * FROM pay_periods WHERE start_date <= ? AND end_date >= ?'
  ).get(today, today);

  const lowHoursStaff = currentPeriod
    ? db.prepare(`
        SELECT staff_member, SUM(hours) AS total_hours
        FROM time_entries
        WHERE pay_period_id = ?
        GROUP BY staff_member
        HAVING total_hours < 40
        ORDER BY total_hours ASC
      `).all(currentPeriod.id)
    : [];

  const ratedStaff = db.prepare(
    'SELECT DISTINCT staff_member FROM staff_rates'
  ).all().map(r => r.staff_member);

  const activeStaff = currentPeriod
    ? db.prepare(
        'SELECT DISTINCT staff_member FROM time_entries WHERE pay_period_id = ?'
      ).all(currentPeriod.id).map(r => r.staff_member)
    : [];

  const missingStaff = ratedStaff.filter(s => !activeStaff.includes(s));

  const overBudget = db.prepare(`
    SELECT e.id, e.client_name, e.engagement_type,
           e.budgeted_hours,
           SUM(t.hours) AS logged_hours,
           ROUND((SUM(t.hours) / e.budgeted_hours) * 100, 1) AS pct_used
    FROM engagements e
    JOIN time_entries t ON t.engagement_id = e.id
    WHERE e.budgeted_hours IS NOT NULL AND e.budgeted_hours > 0
      AND e.status NOT IN ('Complete', 'Cancelled')
    GROUP BY e.id
    HAVING logged_hours > e.budgeted_hours
    ORDER BY pct_used DESC
  `).all();

  res.json({ unreleasedPeriods, lowHoursStaff, missingStaff, overBudget });
});

// ── GET /api/time-summary/daily-hours ─────────────────────────────────────────
// Per-day total hours for one staff member in a date range.
// Query params: staff (required for admin; ignored for non-admin), from, to
// Non-admin callers are always scoped to their own name — ?staff= is ignored.
// Response: { staff, from, to, daily: { "2026-05-11": 3.5, ... } }
router.get('/daily-hours', (req, res) => {
  const { from, to } = req.query;
  // Force self-scope for non-admin callers.
  const staff = req.user.role === 'admin' ? req.query.staff : req.user.full_name;
  if (!staff || !from || !to)
    return res.status(400).json({ error: 'staff, from, and to are required' });

  const rows = db.prepare(`
    SELECT date, SUM(hours) AS hours
    FROM time_entries
    WHERE staff_member = ? AND date >= ? AND date <= ?
    GROUP BY date
  `).all(staff, from, to);

  // Dense map: include 0 for every day in range
  const daily = {};
  const cur   = new Date(from + 'T12:00:00');
  const endD  = new Date(to   + 'T12:00:00');
  while (cur <= endD) {
    daily[cur.toISOString().split('T')[0]] = 0;
    cur.setDate(cur.getDate() + 1);
  }
  rows.forEach(r => { daily[r.date] = r.hours; });

  res.json({ staff, from, to, daily });
});

// ── GET /api/time-summary/my-period/:periodId ─────────────────────────────────
// Timesheet grid for the authenticated user: rows per engagement+service_code,
// columns per day. Used by the per-user TimesheetView.
router.get('/my-period/:periodId', (req, res) => {
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.periodId);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  // Build date array for the period
  const dates = [];
  const cur   = new Date(period.start_date + 'T12:00:00');
  const endD  = new Date(period.end_date   + 'T12:00:00');
  while (cur <= endD) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  // Raw entries for this user in this period — one row per engagement+code+date
  const rawEntries = db.prepare(`
    SELECT te.engagement_id, te.service_code, te.date,
           SUM(te.hours)        AS hours,
           e.client_name, e.engagement_type, e.tax_year,
           sc.number AS sc_number, sc.description AS sc_description
    FROM time_entries te
    JOIN engagements e ON e.id = te.engagement_id
    LEFT JOIN service_codes sc ON sc.code = te.service_code
    WHERE te.user_id = ? AND te.pay_period_id = ?
    GROUP BY te.engagement_id, te.service_code, te.date
    ORDER BY te.engagement_id ASC, te.service_code ASC, te.date ASC
  `).all(req.user.id, period.id);

  // Group into rows: key = "engId::code"
  const rowMap = {};
  rawEntries.forEach(({ engagement_id, service_code, date, hours,
                        client_name, engagement_type, tax_year,
                        sc_number, sc_description }) => {
    const key = `${engagement_id}::${service_code || ''}`;
    if (!rowMap[key]) {
      rowMap[key] = {
        engagement_id, service_code: service_code || null,
        client_name, engagement_type, tax_year,
        sc_number, sc_description,
        daily: {}, total: 0,
      };
    }
    rowMap[key].daily[date]  = (rowMap[key].daily[date] || 0) + hours;
    rowMap[key].total       += hours;
  });

  // Column totals per day
  const colTotals = {};
  dates.forEach(d => { colTotals[d] = 0; });
  Object.values(rowMap).forEach(row => {
    dates.forEach(d => { colTotals[d] += row.daily[d] || 0; });
  });

  const grandTotal = Object.values(colTotals).reduce((s, v) => s + v, 0);

  res.json({
    period,
    dates,
    rows: Object.values(rowMap),
    colTotals,
    grandTotal,
  });
});

module.exports = router;
