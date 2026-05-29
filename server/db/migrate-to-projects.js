/**
 * migrate-to-projects.js
 * One-time migration: creates a project row for each existing engagement that
 * doesn't already have one, then links time_entries and billing_records.
 * Safe to run multiple times (idempotent).
 *
 * Usage: npm run migrate:projects
 */
const db = require('./database');
const { initializeDatabase } = require('./schema');
const { migrate } = require('./migrate');

initializeDatabase();
migrate();

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function derivePeriodLabel(eng) {
  if (eng.tax_year) return String(eng.tax_year);
  if (eng.recurrence_frequency === 'Monthly' && eng.due_date) {
    const d = new Date(eng.due_date + 'T12:00:00Z');
    return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  if (eng.recurrence_frequency === 'Quarterly' && eng.due_date) {
    const d = new Date(eng.due_date + 'T12:00:00Z');
    const q = Math.ceil((d.getUTCMonth() + 1) / 3);
    return `Q${q} ${d.getUTCFullYear()}`;
  }
  return String(new Date().getFullYear());
}

const insertProject = db.prepare(`
  INSERT INTO projects (
    engagement_id, client_name, project_type, entity_type, period_label,
    status, original_due, current_due,
    preparer, budgeted_hours, budgeted_amount, priority
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`);

const linkTimeEntries = db.prepare(
  'UPDATE time_entries SET project_id = ? WHERE engagement_id = ? AND project_id IS NULL'
);
const linkBilling = db.prepare(
  'UPDATE billing_records SET project_id = ? WHERE engagement_id = ? AND project_id IS NULL'
);
const hasProject = db.prepare('SELECT id FROM projects WHERE engagement_id = ? LIMIT 1');

const engagements = db.prepare('SELECT * FROM engagements').all();

let projectCount = 0;
let timeEntryCount = 0;
let billingCount = 0;

for (const eng of engagements) {
  if (hasProject.get(eng.id)) continue; // idempotent — skip if already migrated

  const period_label = derivePeriodLabel(eng);

  const result = insertProject.run(
    eng.id,
    eng.client_name,
    eng.engagement_type || null,
    null,
    period_label,
    eng.status || 'Not Started',
    eng.due_date || null,
    eng.due_date || null,
    eng.assigned_staff || null,
    eng.budgeted_hours || null,
    eng.budgeted_amount || null,
    eng.priority || 'Normal'
  );
  const projectId = result.lastInsertRowid;
  projectCount++;

  const teResult = linkTimeEntries.run(projectId, eng.id);
  timeEntryCount += teResult.changes;

  const brResult = linkBilling.run(projectId, eng.id);
  billingCount += brResult.changes;
}

if (projectCount === 0) {
  console.log('migrate:projects — already up to date, nothing to migrate.');
} else {
  console.log(
    `migrate:projects — Migrated ${projectCount} engagements → ${projectCount} projects, ` +
    `linked ${timeEntryCount} time entries, ${billingCount} billing records.`
  );
}
