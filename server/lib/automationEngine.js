const db = require('../db/database');
const { log } = require('./activityLogger');

function getRules(triggerType) {
  return db.prepare(
    'SELECT * FROM automation_rules WHERE active = 1 AND trigger_type = ?'
  ).all(triggerType);
}

function parseConfig(rule) {
  try { return JSON.parse(rule.trigger_config); } catch { return {}; }
}

function parseAction(rule) {
  try { return JSON.parse(rule.action_config); } catch { return {}; }
}

function fireAction(rule, engagementId) {
  const action = parseAction(rule);
  const eng = db.prepare('SELECT * FROM engagements WHERE id = ?').get(engagementId);
  if (!eng) return;

  let desc = '';
  try {
    switch (rule.action_type) {
      case 'change_status':
        if (eng.status === action.status) return;
        db.prepare('UPDATE engagements SET status = ? WHERE id = ?').run(action.status, engagementId);
        desc = `Status changed to "${action.status}" by automation`;
        break;
      case 'reassign_staff':
        db.prepare('UPDATE engagements SET assigned_staff = ? WHERE id = ?').run(action.staff_member, engagementId);
        desc = `Reassigned to ${action.staff_member} by automation`;
        break;
      case 'create_note':
        db.prepare(`
          INSERT INTO notes (entity_type, entity_id, note_text, category, priority_flag, created_by)
          VALUES ('engagement', ?, ?, 'General', 0, 'Automation')
        `).run(engagementId, action.note_text || `Automation "${rule.name}" fired`);
        desc = `Note created by automation: "${action.note_text || rule.name}"`;
        break;
      case 'set_priority':
        db.prepare('UPDATE engagements SET priority = ? WHERE id = ?').run(action.priority, engagementId);
        desc = `Priority set to "${action.priority}" by automation`;
        break;
      default:
        return;
    }
    log('automation_fired', 'engagement', engagementId,
        `🤖 Automation "${rule.name}": ${desc}`, 'System');
  } catch {
    // Silently skip failed actions
  }
}

// Called after engagement status changes
function runStatusChanged(engagementId, newStatus, previousStatus) {
  if (newStatus === previousStatus) return;
  const rules = getRules('status_changed');
  rules.forEach(rule => {
    const cfg = parseConfig(rule);
    if (cfg.to_status === newStatus) fireAction(rule, engagementId);
  });
}

// Called after a subtask is completed
function runSubtaskCompleted(engagementId, subtaskTitle) {
  const rules = getRules('subtask_completed');
  rules.forEach(rule => {
    const cfg = parseConfig(rule);
    const pattern = (cfg.title_pattern || '').toLowerCase();
    if (!pattern || subtaskTitle.toLowerCase().includes(pattern)) {
      // Check all_complete flag
      if (cfg.all_complete) {
        const total    = db.prepare('SELECT COUNT(*) AS n FROM subtasks WHERE engagement_id = ?').get(engagementId)?.n || 0;
        const complete = db.prepare("SELECT COUNT(*) AS n FROM subtasks WHERE engagement_id = ? AND status = 'Complete'").get(engagementId)?.n || 0;
        if (total === 0 || complete < total) return;
      }
      fireAction(rule, engagementId);
    }
  });
}

// Called after a time entry is added — check budget_exceeds
function runBudgetCheck(engagementId) {
  const rules = getRules('budget_exceeds');
  if (!rules.length) return;

  const eng = db.prepare('SELECT * FROM engagements WHERE id = ?').get(engagementId);
  if (!eng || !eng.budgeted_hours) return;

  const { actual } = db.prepare('SELECT COALESCE(SUM(hours), 0) AS actual FROM time_entries WHERE engagement_id = ?').get(engagementId);
  const pct = (actual / eng.budgeted_hours) * 100;

  rules.forEach(rule => {
    const cfg = parseConfig(rule);
    if (pct >= (cfg.percentage || 90)) fireAction(rule, engagementId);
  });
}

// Called on dashboard load — check due_date_within for all relevant engagements
function runDueDateChecks() {
  const rules = getRules('due_date_within');
  if (!rules.length) return;

  rules.forEach(rule => {
    const cfg = parseConfig(rule);
    const days = cfg.days || 3;
    const targetDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const engagements = db.prepare(`
      SELECT * FROM engagements
      WHERE due_date BETWEEN ? AND ?
        AND status NOT IN ('Complete', 'On Hold')
    `).all(today, targetDate);

    engagements.forEach(eng => fireAction(rule, eng.id));
  });
}

module.exports = { runStatusChanged, runSubtaskCompleted, runBudgetCheck, runDueDateChecks };
