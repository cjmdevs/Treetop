const express = require('express');
const db = require('../db/database');
const router = express.Router();
const { log }                        = require('../lib/activityLogger');
const { runStatusChanged, runDueDateChecks } = require('../lib/automationEngine');

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function nextDueDate(dueDate, freq) {
  if (!dueDate) return null;
  if (freq === 'Monthly')   return addDays(dueDate, 30);
  if (freq === 'Quarterly') return addDays(dueDate, 91);
  if (freq === 'Annually')  return addDays(dueDate, 365);
  return null;
}

router.get('/', (req, res) => {
  const { status, type, assigned_staff } = req.query;
  let query = `
    SELECT e.*,
      COUNT(DISTINCT s.id) as subtask_count,
      SUM(CASE WHEN s.status = 'Complete' THEN 1 ELSE 0 END) as subtask_complete,
      COALESCE(SUM(te.hours), 0) as actual_hours,
      COALESCE(SUM(CASE WHEN te.billable = 1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END), 0) as actual_amount
    FROM engagements e
    LEFT JOIN subtasks s ON s.engagement_id = e.id
    LEFT JOIN time_entries te ON te.engagement_id = e.id
    WHERE 1=1
  `;
  const params = [];
  if (status)         { query += ' AND e.status = ?';           params.push(status); }
  if (type)           { query += ' AND e.engagement_type = ?';  params.push(type); }
  if (assigned_staff) { query += ' AND e.assigned_staff = ?';   params.push(assigned_staff); }
  query += ' GROUP BY e.id ORDER BY e.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// GET /api/engagements/client-names?q=text&limit=20
// Returns distinct client_name values matching partial text — for autocomplete; never loads full list
router.get('/client-names', (req, res) => {
  const { q, limit = '20' } = req.query;
  if (!q || q.length < 2) return res.json({ names: [] });
  const cap   = Math.min(parseInt(limit, 10) || 20, 50);
  const names = db.prepare(
    `SELECT DISTINCT client_name FROM engagements
     WHERE LOWER(client_name) LIKE LOWER(?) AND client_name IS NOT NULL
     ORDER BY client_name LIMIT ?`
  ).all(`%${q}%`, cap).map(r => r.client_name);
  res.json({ names });
});

router.get('/:id', (req, res) => {
  const eng = db.prepare('SELECT * FROM engagements WHERE id = ?').get(req.params.id);
  if (!eng) return res.status(404).json({ error: 'Not found' });

  const timeEntries = db.prepare(
    'SELECT * FROM time_entries WHERE engagement_id = ? ORDER BY date DESC'
  ).all(req.params.id);
  const billing = db.prepare(
    'SELECT * FROM billing_records WHERE engagement_id = ?'
  ).all(req.params.id);
  const subtasks = db.prepare(
    'SELECT * FROM subtasks WHERE engagement_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(req.params.id);
  const customFields = db.prepare(`
    SELECT cfv.*, cfd.field_name, cfd.field_type, cfd.dropdown_options
    FROM custom_field_values cfv
    JOIN custom_field_definitions cfd ON cfd.id = cfv.field_definition_id
    WHERE cfv.engagement_id = ?
  `).all(req.params.id);

  const totalHours    = timeEntries.reduce((s, e) => s + e.hours, 0);
  const totalBillable = timeEntries
    .filter(e => e.billable)
    .reduce((s, e) => s + e.hours * (e.billing_rate || 0), 0);

  res.json({ ...eng, timeEntries, billing, subtasks, customFields, totalHours, totalBillable });
});

router.post('/', (req, res) => {
  const {
    client_name, engagement_type, tax_year, due_date, status, assigned_staff, priority, notes,
    budgeted_hours, budgeted_amount, recurrence_frequency, template_id,
  } = req.body;

  const result = db.prepare(`
    INSERT INTO engagements
      (client_name, engagement_type, tax_year, due_date, status, assigned_staff, priority, notes,
       budgeted_hours, budgeted_amount, recurrence_frequency, template_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    client_name, engagement_type, tax_year || null, due_date || null,
    status || 'Not Started', assigned_staff || null, priority || 'Medium', notes || null,
    budgeted_hours || null, budgeted_amount || null,
    recurrence_frequency || 'None', template_id || null
  );

  const engId = result.lastInsertRowid;

  log('engagement_created', 'engagement', engId,
      `Engagement created: ${client_name} — ${engagement_type}`, null, req.user.full_name, req.user.id);

  if (template_id) {
    const tmplSubtasks = db.prepare(
      'SELECT * FROM template_subtasks WHERE template_id = ? ORDER BY sort_order ASC'
    ).all(template_id);
    tmplSubtasks.forEach(ts => {
      db.prepare(
        'INSERT INTO subtasks (engagement_id, title, assigned_staff, sort_order) VALUES (?, ?, ?, ?)'
      ).run(engId, ts.title, ts.default_assignee_role || null, ts.sort_order);
    });
  }

  res.status(201).json(db.prepare('SELECT * FROM engagements WHERE id = ?').get(engId));
});

router.put('/:id', (req, res) => {
  const {
    client_name, engagement_type, tax_year, due_date, status, assigned_staff, priority, notes,
    budgeted_hours, budgeted_amount, recurrence_frequency, template_id,
  } = req.body;

  const prev = db.prepare('SELECT * FROM engagements WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });

  const result = db.prepare(`
    UPDATE engagements
    SET client_name=?, engagement_type=?, tax_year=?, due_date=?, status=?, assigned_staff=?,
        priority=?, notes=?, budgeted_hours=?, budgeted_amount=?, recurrence_frequency=?, template_id=?
    WHERE id=?
  `).run(
    client_name, engagement_type, tax_year || null, due_date || null,
    status, assigned_staff || null, priority, notes || null,
    budgeted_hours || null, budgeted_amount || null,
    recurrence_frequency || 'None', template_id || null,
    req.params.id
  );

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

  if (status !== prev.status)
    log('status_changed', 'engagement', req.params.id,
        `Status: "${prev.status}" → "${status}"`, assigned_staff, req.user.full_name, req.user.id);
  if (assigned_staff !== prev.assigned_staff)
    log('staff_assigned', 'engagement', req.params.id,
        `Assigned to ${assigned_staff || '(none)'}`, assigned_staff, req.user.full_name, req.user.id);
  runStatusChanged(req.params.id, status, prev.status);

  const freq = recurrence_frequency || prev.recurrence_frequency;
  if (status === 'Complete' && prev.status !== 'Complete' && freq !== 'None') {
    const newDue = nextDueDate(due_date || prev.due_date, freq);
    db.prepare(`
      INSERT INTO engagements
        (client_name, engagement_type, tax_year, due_date, status, assigned_staff, priority,
         notes, budgeted_hours, budgeted_amount, recurrence_frequency, template_id)
      VALUES (?, ?, ?, ?, 'Not Started', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client_name, engagement_type, tax_year || null, newDue,
      assigned_staff || null, priority, notes || null,
      budgeted_hours || null, budgeted_amount || null, freq, template_id || null
    );
  }

  res.json(db.prepare('SELECT * FROM engagements WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM engagements WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

router.patch('/bulk', (req, res) => {
  const { ids, status, assigned_staff } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });
  if (status) {
    const stmt = db.prepare('UPDATE engagements SET status=? WHERE id=?');
    ids.forEach(id => stmt.run(status, id));
  } else if (assigned_staff !== undefined) {
    const stmt = db.prepare('UPDATE engagements SET assigned_staff=? WHERE id=?');
    ids.forEach(id => stmt.run(assigned_staff || null, id));
  } else {
    return res.status(400).json({ error: 'status or assigned_staff required' });
  }
  res.json({ updated: ids.length });
});

module.exports = router;
