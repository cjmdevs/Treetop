const express = require('express');
const db = require('../db/database');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required.' });
  next();
}

router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT DISTINCT assigned_staff AS name FROM engagements WHERE assigned_staff IS NOT NULL ORDER BY assigned_staff'
  ).all();
  res.json(rows.map(r => r.name));
});

// /dashboard must be declared before any /:param routes
// Admin only — exposes all staff members' hours and workload (other-users' time)
router.get('/dashboard', requireAdmin, (req, res) => {
  const staffRows = db.prepare(
    'SELECT DISTINCT assigned_staff AS name FROM engagements WHERE assigned_staff IS NOT NULL'
  ).all();

  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const weekStart = d.toISOString().split('T')[0];

  const result = staffRows.map(({ name }) => {
    const engagements = db.prepare(`
      SELECT * FROM engagements
      WHERE assigned_staff = ? AND status NOT IN ('Complete', 'On Hold')
      ORDER BY due_date ASC
    `).all(name);

    const { total: weeklyHours } = db.prepare(`
      SELECT COALESCE(SUM(hours), 0) AS total
      FROM time_entries WHERE staff_member = ? AND date >= ?
    `).get(name, weekStart);

    return { name, engagements, weeklyHours, activeCount: engagements.length };
  });

  res.json(result);
});

// /detail/:name must be declared before any generic /:param routes
// Admin only — exposes another user's hours, billable amounts, trend, and client breakdown
router.get('/detail/:name', requireAdmin, (req, res) => {
  const name = req.params.name;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const today = now.toISOString().split('T')[0];

  // Weekly breakdown (last 7 days, by day)
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
  const byDay = db.prepare(`
    SELECT date, SUM(hours) as hours,
      SUM(CASE WHEN billable=1 THEN hours ELSE 0 END) as billable_hours
    FROM time_entries WHERE staff_member = ? AND date >= ?
    GROUP BY date ORDER BY date ASC
  `).all(name, weekAgo);

  // Monthly totals
  const monthly = db.prepare(`
    SELECT COALESCE(SUM(hours),0) as total_hours,
      COALESCE(SUM(CASE WHEN billable=1 THEN hours ELSE 0 END),0) as billable_hours,
      COALESCE(SUM(CASE WHEN billable=0 THEN hours ELSE 0 END),0) as nonbillable_hours,
      COALESCE(SUM(CASE WHEN billable=1 THEN hours*COALESCE(billing_rate,0) ELSE 0 END),0) as billable_amount
    FROM time_entries WHERE staff_member = ? AND date >= ?
  `).get(name, monthStart);

  // Top clients this month
  const topClients = db.prepare(`
    SELECT e.client_name, SUM(te.hours) as hours
    FROM time_entries te JOIN engagements e ON e.id = te.engagement_id
    WHERE te.staff_member = ? AND te.date >= ?
    GROUP BY e.client_name ORDER BY hours DESC LIMIT 5
  `).all(name, monthStart);

  // Active engagements
  const engagements = db.prepare(`
    SELECT e.*,
      COALESCE(SUM(te.hours),0) as actual_hours
    FROM engagements e
    LEFT JOIN time_entries te ON te.engagement_id = e.id
    WHERE e.assigned_staff = ? AND e.status NOT IN ('Complete','On Hold')
    GROUP BY e.id ORDER BY e.due_date ASC
  `).all(name);

  // 8-week trend (billable hours per week)
  const trend = [];
  for (let i = 7; i >= 0; i--) {
    const wEnd   = new Date(Date.now() - i*7*86400000);
    const wStart = new Date(wEnd.getTime() - 7*86400000);
    const label  = `W${8-i}`;
    const { h } = db.prepare(`
      SELECT COALESCE(SUM(hours),0) as h FROM time_entries
      WHERE staff_member=? AND billable=1
        AND date BETWEEN ? AND ?
    `).get(name, wStart.toISOString().split('T')[0], wEnd.toISOString().split('T')[0]);
    trend.push({ label, hours: h });
  }

  // Recent activity
  const activity = db.prepare(`
    SELECT * FROM activity_log WHERE staff_member = ?
    ORDER BY created_at DESC LIMIT 20
  `).all(name);

  res.json({
    name, monthly, byDay, topClients, engagements, trend, activity,
    utilization_pct: monthly?.billable_hours
      ? Math.round((monthly.billable_hours / 160) * 100) : 0,
  });
});

module.exports = router;
