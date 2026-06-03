const express = require('express');
const db = require('../db/database');
const router = express.Router();
const { log } = require('../lib/activityLogger');

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function advancePeriodLabel(periodLabel) {
  const label = (periodLabel || '').trim();
  if (/^\d{4}$/.test(label)) return String(parseInt(label) + 1);

  const qMatch = label.match(/^Q(\d)\s+(\d{4})$/i);
  if (qMatch) {
    let q = parseInt(qMatch[1]);
    let yr = parseInt(qMatch[2]);
    if (++q > 4) { q = 1; yr++; }
    return `Q${q} ${yr}`;
  }

  const mMatch = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (mMatch) {
    const mi = MONTHS.findIndex(m => m.toLowerCase() === mMatch[1].substring(0, 3).toLowerCase());
    if (mi >= 0) {
      let yr = parseInt(mMatch[2]);
      let next = mi + 1;
      if (next >= 12) { next = 0; yr++; }
      return `${MONTHS[next]} ${yr}`;
    }
  }
  return label;
}

function advanceDueDate(dueDateStr, freq) {
  if (!dueDateStr) return null;
  const d = new Date(dueDateStr + 'T12:00:00Z');
  if (freq === 'Monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1);
  } else if (freq === 'Quarterly') {
    d.setUTCMonth(d.getUTCMonth() + 3);
  } else {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return d.toISOString().split('T')[0];
}

function doRollForward(project, eng) {
  const freq = eng.recurrence_frequency || 'Annually';
  const newPeriodLabel = advancePeriodLabel(project.period_label || '');
  const newOrigDue = advanceDueDate(project.original_due, freq);
  const newCurrDue = advanceDueDate(project.current_due || project.original_due, freq);

  const result = db.prepare(`
    INSERT INTO projects (
      engagement_id, client_name, project_type, entity_type, period_label,
      fiscal_year_end, status, original_due, current_due, extended,
      client_number, engagement_number, primary_partner, manager, preparer,
      reviewer, in_charge, budgeted_hours, budgeted_amount, priority, prior_project_id
    ) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    project.engagement_id, project.client_name, project.project_type,
    project.entity_type, newPeriodLabel, project.fiscal_year_end,
    'Not Started', newOrigDue, newCurrDue,
    project.client_number, project.engagement_number,
    project.primary_partner, project.manager, project.preparer,
    project.reviewer, project.in_charge,
    project.budgeted_hours, project.budgeted_amount, project.priority,
    project.id
  );
  const newProjectId = result.lastInsertRowid;

  // Copy subtasks from source project, reset to Not Started
  const srcSubtasks = db.prepare(
    'SELECT * FROM subtasks WHERE project_id = ? ORDER BY sort_order ASC'
  ).all(project.id);

  for (const st of srcSubtasks) {
    db.prepare(`
      INSERT INTO subtasks (engagement_id, project_id, title, assigned_staff, status, sort_order)
      VALUES (?, ?, ?, ?, 'Not Started', ?)
    `).run(project.engagement_id, newProjectId, st.title, st.assigned_staff, st.sort_order);
  }

  // Fallback: if source had no project subtasks, pull from workflow template
  if (srcSubtasks.length === 0 && eng.template_id) {
    const tmplSubtasks = db.prepare(
      'SELECT * FROM template_subtasks WHERE template_id = ? ORDER BY sort_order ASC'
    ).all(eng.template_id);
    for (const ts of tmplSubtasks) {
      db.prepare(`
        INSERT INTO subtasks (engagement_id, project_id, title, assigned_staff, status, sort_order)
        VALUES (?, ?, ?, ?, 'Not Started', ?)
      `).run(project.engagement_id, newProjectId, ts.title, ts.default_assignee_role || null, ts.sort_order);
    }
  }

  log('project_rolled_forward', 'project', newProjectId,
    `Rolled forward from #${project.id} (${project.period_label}) → ${newPeriodLabel}`);

  return db.prepare('SELECT * FROM projects WHERE id = ?').get(newProjectId);
}

// ── GET /api/projects/check-group — show/hide related-entities toggle ────────
router.get('/check-group', (req, res) => {
  const { client_name } = req.query;
  if (!client_name) return res.json({ has_group: false, group_id: null });
  const contact = db.prepare(`
    SELECT client_group_id FROM contacts
    WHERE (display_name LIKE ? OR business_name LIKE ? OR client_code LIKE ?)
      AND client_group_id IS NOT NULL
    LIMIT 1
  `).get(`%${client_name}%`, `%${client_name}%`, `%${client_name}%`);
  res.json({ has_group: !!contact, group_id: contact?.client_group_id ?? null });
});

// ── GET /api/projects/meta/milestone-fields ────────────────────────────────────
router.get('/meta/milestone-fields', (req, res) => {
  const fields = db.prepare(
    "SELECT * FROM custom_field_definitions WHERE scope='project' ORDER BY sort_order ASC"
  ).all();
  res.json(fields);
});

// ── GET /api/projects ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const {
    client_name, project_type, entity_type, status, primary_partner, manager,
    preparer, reviewer, in_charge, priority, due_from, due_to, period_label,
    show_completed, show_delivered, show_related, sort = 'current_due', dir = 'ASC',
  } = req.query;

  const ALLOWED_SORT = [
    'id','client_name','project_type','entity_type','period_label','status',
    'original_due','current_due','priority','primary_partner','manager',
    'preparer','reviewer','in_charge','created_at','updated_at',
  ];
  const sortCol = ALLOWED_SORT.includes(sort) ? sort : 'current_due';
  const sortDir = dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  let query = `
    SELECT p.*,
      e.engagement_type, e.recurrence_frequency,
      COALESCE(SUM(te.hours), 0) as actual_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate,0) ELSE 0 END), 0) as actual_amount,
      (SELECT json_group_object(CAST(pcfv.field_definition_id AS TEXT), pcfv.value)
       FROM project_custom_field_values pcfv WHERE pcfv.project_id = p.id) as milestone_values_json
    FROM projects p
    JOIN engagements e ON e.id = p.engagement_id
    LEFT JOIN time_entries te ON te.project_id = p.id
    WHERE 1=1
  `;
  const params = [];

  // client_name filter — with optional client-group expansion
  if (client_name) {
    if (show_related === 'true') {
      // Find all contacts in the same client_group and include their names
      const groupMembers = db.prepare(`
        SELECT DISTINCT c2.display_name, c2.business_name
        FROM contacts c1
        JOIN contacts c2 ON c2.client_group_id = c1.client_group_id
        WHERE c1.client_group_id IS NOT NULL
          AND (c1.display_name LIKE ? OR c1.business_name LIKE ? OR c1.client_code LIKE ?)
      `).all(`%${client_name}%`, `%${client_name}%`, `%${client_name}%`);

      if (groupMembers.length > 0) {
        const names = [...new Set(groupMembers.flatMap(c => [c.display_name, c.business_name].filter(Boolean)))];
        query += ` AND p.client_name IN (${names.map(() => '?').join(',')})`;
        params.push(...names);
      } else {
        query += ' AND p.client_name LIKE ?'; params.push(`%${client_name}%`);
      }
    } else {
      query += ' AND p.client_name LIKE ?'; params.push(`%${client_name}%`);
    }
  }
  if (project_type)    { query += ' AND p.project_type = ?';       params.push(project_type); }
  if (entity_type)     { query += ' AND p.entity_type = ?';        params.push(entity_type); }
  if (status)          { query += ' AND p.status = ?';             params.push(status); }
  if (primary_partner) { query += ' AND p.primary_partner = ?';    params.push(primary_partner); }
  if (manager)         { query += ' AND p.manager = ?';            params.push(manager); }
  if (preparer)        { query += ' AND p.preparer = ?';           params.push(preparer); }
  if (reviewer)        { query += ' AND p.reviewer = ?';           params.push(reviewer); }
  if (in_charge)       { query += ' AND p.in_charge = ?';          params.push(in_charge); }
  if (priority)        { query += ' AND p.priority = ?';           params.push(priority); }
  if (due_from)        { query += ' AND p.current_due >= ?';       params.push(due_from); }
  if (due_to)          { query += ' AND p.current_due <= ?';       params.push(due_to); }
  if (period_label)    { query += ' AND p.period_label = ?';       params.push(period_label); }
  if (!show_completed || show_completed === 'false') {
    query += " AND p.status != 'Completed'";
  }
  if (!show_delivered || show_delivered === 'false') {
    query += " AND p.status != 'Delivered'";
  }

  query += ` GROUP BY p.id ORDER BY p.${sortCol} ${sortDir}`;
  res.json(db.prepare(query).all(...params));
});

// ── GET /api/projects/by-client/:clientName — must be before /:id ─────────────
router.get('/by-client/:clientName', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, e.engagement_type, e.recurrence_frequency
    FROM projects p
    JOIN engagements e ON e.id = p.engagement_id
    WHERE p.client_name = ?
    ORDER BY p.period_label DESC, p.created_at DESC
  `).all(req.params.clientName);
  res.json(projects);
});

// ── POST /api/projects/roll-forward-batch — must be before /:id ───────────────
router.post('/roll-forward-batch', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids array required' });
  }

  const results = [];
  for (const id of ids) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) { results.push({ id, error: 'Not found' }); continue; }
    const eng = db.prepare('SELECT * FROM engagements WHERE id = ?').get(project.engagement_id);
    if (!eng) { results.push({ id, error: 'Engagement not found' }); continue; }
    try {
      const newProject = doRollForward(project, eng);
      results.push({ id, newProjectId: newProject.id, period_label: newProject.period_label });
    } catch (err) {
      results.push({ id, error: err.message });
    }
  }
  res.json({ results });
});

// ── GET /api/projects/:id ──────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const project = db.prepare(`
    SELECT p.*, e.engagement_type, e.recurrence_frequency
    FROM projects p
    JOIN engagements e ON e.id = p.engagement_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const subtasks = db.prepare(
    'SELECT * FROM subtasks WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(req.params.id);

  const timeSummary = db.prepare(`
    SELECT
      COUNT(*) as entry_count,
      COALESCE(SUM(hours), 0) as total_hours,
      COALESCE(SUM(CASE WHEN billable=1 THEN hours*COALESCE(billing_rate,0) ELSE 0 END), 0) as total_amount
    FROM time_entries WHERE project_id = ?
  `).get(req.params.id);

  const billingSummary = db.prepare(`
    SELECT COUNT(*) as record_count, COALESCE(SUM(invoice_amount), 0) as total_billed
    FROM billing_records WHERE project_id = ?
  `).get(req.params.id);

  res.json({ ...project, subtasks, timeSummary, billingSummary });
});

// ── POST /api/projects ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  let {
    engagement_id, contact_id, client_name, project_type, entity_type, period_label,
    fiscal_year_end, status, original_due, current_due, start_date,
    delivered_date, completed_date, extended, client_number, engagement_number,
    primary_partner, manager, preparer, reviewer, in_charge,
    budgeted_hours, budgeted_amount, priority, prior_project_id,
    // Used for auto-creating engagement when engagement_id is not supplied
    engagement_type, recurrence_frequency,
  } = req.body;

  if (!client_name && !contact_id) {
    return res.status(400).json({ error: 'client_name or contact_id required' });
  }

  // If contact_id provided but no client_name, look up the client name
  if (contact_id && !client_name) {
    const contact = db.prepare('SELECT display_name, business_name, client_code FROM contacts WHERE id = ?').get(contact_id);
    if (contact) {
      client_name = contact.display_name || contact.business_name;
      if (!client_number && contact.client_code) client_number = contact.client_code;
    }
  }

  // If client_name provided but no contact_id, look up from contacts
  if (client_name && !contact_id) {
    const contact = db.prepare(
      'SELECT id FROM contacts WHERE display_name = ? OR business_name = ? LIMIT 1'
    ).get(client_name, client_name);
    if (contact) contact_id = contact.id;
  }

  // Auto-find or create engagement when engagement_id not provided
  if (!engagement_id) {
    const engType = engagement_type || project_type || 'Tax Return';
    const existing = db.prepare(
      'SELECT id FROM engagements WHERE client_name = ? AND engagement_type = ? LIMIT 1'
    ).get(client_name, engType);

    if (existing) {
      engagement_id = existing.id;
    } else {
      const r = db.prepare(`
        INSERT INTO engagements
          (client_name, engagement_type, recurrence_frequency, status, priority)
        VALUES (?, ?, ?, 'Not Started', ?)
      `).run(client_name, engType, recurrence_frequency || 'Annually', priority || 'Normal');
      engagement_id = r.lastInsertRowid;
    }
  }

  const result = db.prepare(`
    INSERT INTO projects (
      engagement_id, contact_id, client_name, project_type, entity_type, period_label,
      fiscal_year_end, status, original_due, current_due, start_date,
      delivered_date, completed_date, extended, client_number, engagement_number,
      primary_partner, manager, preparer, reviewer, in_charge,
      budgeted_hours, budgeted_amount, priority, prior_project_id
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    engagement_id, contact_id || null, client_name, project_type || null, entity_type || null,
    period_label || null, fiscal_year_end || null, status || 'Not Started',
    original_due || null, current_due || original_due || null, start_date || null,
    delivered_date || null, completed_date || null, extended ? 1 : 0,
    client_number || null, engagement_number || null,
    primary_partner || null, manager || null, preparer || null,
    reviewer || null, in_charge || null,
    budgeted_hours != null ? budgeted_hours : null,
    budgeted_amount != null ? budgeted_amount : null,
    priority || 'Normal', prior_project_id || null
  );

  log('project_created', 'project', result.lastInsertRowid,
    `Project created: ${client_name} — ${period_label || ''}`);

  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT /api/projects/:id ──────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const prev = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });

  const {
    client_name, project_type, entity_type, period_label, fiscal_year_end,
    status, original_due, current_due, start_date, delivered_date, completed_date,
    extended, client_number, engagement_number, primary_partner, manager,
    preparer, reviewer, in_charge, budgeted_hours, budgeted_amount, priority,
  } = req.body;

  db.prepare(`
    UPDATE projects SET
      client_name=?, project_type=?, entity_type=?, period_label=?, fiscal_year_end=?,
      status=?, original_due=?, current_due=?, start_date=?, delivered_date=?,
      completed_date=?, extended=?, client_number=?, engagement_number=?,
      primary_partner=?, manager=?, preparer=?, reviewer=?, in_charge=?,
      budgeted_hours=?, budgeted_amount=?, priority=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(
    client_name       ?? prev.client_name,
    project_type      ?? prev.project_type,
    entity_type       ?? prev.entity_type,
    period_label      ?? prev.period_label,
    fiscal_year_end   ?? prev.fiscal_year_end,
    status            ?? prev.status,
    original_due      ?? prev.original_due,
    current_due       ?? prev.current_due,
    start_date        ?? prev.start_date,
    delivered_date    ?? prev.delivered_date,
    completed_date    ?? prev.completed_date,
    extended !== undefined ? (extended ? 1 : 0) : prev.extended,
    client_number     ?? prev.client_number,
    engagement_number ?? prev.engagement_number,
    primary_partner   ?? prev.primary_partner,
    manager           ?? prev.manager,
    preparer          ?? prev.preparer,
    reviewer          ?? prev.reviewer,
    in_charge         ?? prev.in_charge,
    budgeted_hours    !== undefined ? budgeted_hours    : prev.budgeted_hours,
    budgeted_amount   !== undefined ? budgeted_amount   : prev.budgeted_amount,
    priority          ?? prev.priority,
    req.params.id
  );

  if (status && status !== prev.status) {
    log('status_changed', 'project', req.params.id,
      `Status: "${prev.status}" → "${status}"`, prev.primary_partner);
  }

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

// ── PATCH /api/projects/:id/status ────────────────────────────────────────────
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });

  const prev = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });

  const today = new Date().toISOString().split('T')[0];
  const startDate     = (status === 'In Progress' && !prev.start_date)    ? today : prev.start_date;
  const completedDate = (status === 'Completed'   && !prev.completed_date) ? today : prev.completed_date;
  const deliveredDate = (status === 'Delivered'   && !prev.delivered_date) ? today : prev.delivered_date;

  db.prepare(`
    UPDATE projects
    SET status=?, start_date=?, completed_date=?, delivered_date=?, updated_at=datetime('now')
    WHERE id=?
  `).run(status, startDate, completedDate, deliveredDate, req.params.id);

  log('status_changed', 'project', req.params.id,
    `Status: "${prev.status}" → "${status}"`, prev.primary_partner);

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

// ── POST /api/projects/:id/roll-forward ───────────────────────────────────────
router.post('/:id/roll-forward', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const eng = db.prepare('SELECT * FROM engagements WHERE id = ?').get(project.engagement_id);
  if (!eng) return res.status(404).json({ error: 'Engagement not found' });

  const newProject = doRollForward(project, eng);
  res.status(201).json(newProject);
});

// ── GET /api/projects/:id/milestones ──────────────────────────────────────────
router.get('/:id/milestones', (req, res) => {
  const values = db.prepare(`
    SELECT pcfv.*, cfd.field_name, cfd.field_type, cfd.dropdown_options
    FROM project_custom_field_values pcfv
    JOIN custom_field_definitions cfd ON cfd.id = pcfv.field_definition_id
    WHERE pcfv.project_id = ?
  `).all(req.params.id);
  res.json(values);
});

// ── POST /api/projects/:id/milestones ─────────────────────────────────────────
router.post('/:id/milestones', (req, res) => {
  const { field_definition_id, value } = req.body;
  if (!field_definition_id) return res.status(400).json({ error: 'field_definition_id required' });
  db.prepare(`
    INSERT INTO project_custom_field_values (project_id, field_definition_id, value)
    VALUES (?, ?, ?)
    ON CONFLICT(project_id, field_definition_id) DO UPDATE SET value = excluded.value
  `).run(req.params.id, field_definition_id, value ?? null);
  res.json({ ok: true });
});

module.exports = router;
