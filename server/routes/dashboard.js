const express = require('express');
const db = require('../db/database');
const router = express.Router();
const { runDueDateChecks } = require('../lib/automationEngine');

router.get('/', (req, res) => {
  // Non-admin: return personal data only — no firm-wide financials or other users' data
  if (req.user.role !== 'admin') {
    const staffName  = req.user.full_name;
    const today      = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 8) + '01';

    const { total: myHoursThisMonth } = db.prepare(`
      SELECT COALESCE(SUM(hours), 0) AS total
      FROM time_entries
      WHERE staff_member = ? AND date >= ? AND date <= ?
    `).get(staffName, monthStart, today);

    const myRecentActivity = db.prepare(`
      SELECT * FROM activity_log
      WHERE acted_by_name = ?
      ORDER BY created_at DESC LIMIT 10
    `).all(staffName);

    const myRecentProjects = db.prepare(`
      SELECT p.*, e.engagement_type, e.recurrence_frequency
      FROM projects p
      JOIN engagements e ON e.id = p.engagement_id
      WHERE (p.primary_partner = ? OR p.manager = ? OR p.preparer = ? OR p.reviewer = ? OR p.in_charge = ?)
        AND p.status NOT IN ('Completed','Delivered')
      ORDER BY p.updated_at DESC LIMIT 6
    `).all(staffName, staffName, staffName, staffName, staffName);

    return res.json({
      isPersonal: true,
      myHoursThisMonth,
      myRecentActivity,
      myRecentProjects,
    });
  }

  // Admin: full firm overview
  const today    = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const weekAgo  = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const { count: activeEngagements } = db.prepare(
    "SELECT COUNT(*) AS count FROM engagements WHERE status NOT IN ('Complete','On Hold')"
  ).get();

  const { count: dueThisWeek } = db.prepare(
    "SELECT COUNT(*) AS count FROM engagements WHERE due_date BETWEEN ? AND ? AND status != 'Complete'"
  ).get(today, nextWeek);

  const { total: unbilledHours } = db.prepare(
    'SELECT COALESCE(SUM(hours), 0) AS total FROM time_entries WHERE billable = 1'
  ).get();

  const { total: unbilledAmount } = db.prepare(
    "SELECT COALESCE(SUM(invoice_amount), 0) AS total FROM billing_records WHERE status = 'Unbilled'"
  ).get();

  const recentEngagements = db.prepare(
    'SELECT * FROM engagements ORDER BY created_at DESC LIMIT 5'
  ).all();

  // Budget alerts: engagements where actual hours >= 90% of budgeted
  const budgetAlerts = db.prepare(`
    SELECT e.id, e.client_name, e.engagement_type, e.assigned_staff,
           e.budgeted_hours, COALESCE(SUM(te.hours), 0) as actual_hours
    FROM engagements e
    LEFT JOIN time_entries te ON te.engagement_id = e.id
    WHERE e.budgeted_hours IS NOT NULL
      AND e.status NOT IN ('Complete', 'On Hold')
    GROUP BY e.id
    HAVING actual_hours >= e.budgeted_hours * 0.9
    ORDER BY (actual_hours / e.budgeted_hours) DESC
  `).all();

  // AR aging summary
  const arBuckets = { current: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
  const unpaid = db.prepare(
    "SELECT invoice_amount, invoice_date, created_at FROM billing_records WHERE status IN ('Unbilled','Invoiced')"
  ).all();
  unpaid.forEach(r => {
    const refDate = new Date(r.invoice_date || r.created_at);
    const days = Math.floor((new Date() - refDate) / 86400000);
    if (days <= 30)      arBuckets.current    += r.invoice_amount;
    else if (days <= 60) arBuckets.days31_60  += r.invoice_amount;
    else if (days <= 90) arBuckets.days61_60  += r.invoice_amount;
    else                 arBuckets.days90plus += r.invoice_amount;
  });

  // Overdue engagements
  const overdueEngagements = db.prepare(
    "SELECT * FROM engagements WHERE due_date < ? AND status NOT IN ('Complete','On Hold') ORDER BY due_date ASC LIMIT 10"
  ).all(today);

  // Staff utilization (hours logged this week / 40h standard)
  const staffUtilization = db.prepare(`
    SELECT staff_member,
           COALESCE(SUM(hours), 0) as hours_this_week
    FROM time_entries
    WHERE date >= ?
    GROUP BY staff_member
    ORDER BY hours_this_week DESC
  `).all(weekAgo);

  runDueDateChecks();

  const recentActivity = db.prepare(
    'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20'
  ).all();

  const dueThisWeekDetail = db.prepare(
    "SELECT * FROM engagements WHERE due_date BETWEEN ? AND ? AND status != 'Complete' ORDER BY due_date ASC"
  ).all(today, nextWeek);

  res.json({
    activeEngagements, dueThisWeek, unbilledHours, unbilledAmount,
    recentEngagements, budgetAlerts, arBuckets, overdueEngagements, staffUtilization,
    recentActivity, dueThisWeekDetail,
  });
});

module.exports = router;
