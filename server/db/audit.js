// MGR CPAs — Database Integrity Audit
// Usage: node server/db/audit.js
// Read-only: makes NO changes to the database.

const db = require('./database');

const JUNK_PATTERNS = /^(test|asdf|foo|bar|baz|aaa|bbb|[a-z])$/i;
const JUNK_WORDS    = ['test', 'testing', 'asdf', 'temp', 'junk', 'dummy', 'foo', 'bar', 'xxx', 'eating', 'bebops', 'family'];

let totalIssues = 0;

function section(title) {
  console.log('\n' + '═'.repeat(66));
  console.log('  ' + title);
  console.log('═'.repeat(66));
}

function ok(msg)    { console.log('  ✓  ' + msg); }
function warn(msg)  { console.log('  ⚠  ' + msg); totalIssues++; }
function row(msg)   { console.log('       ' + msg); }

// ── Helpers ────────────────────────────────────────────────────────────────────

const allProjectStatuses = db.prepare('SELECT label FROM project_statuses').all().map(r => r.label);
const validStatusSet     = new Set(allProjectStatuses);

// ── 1. SCHEMA SNAPSHOT ────────────────────────────────────────────────────────

section('1. SCHEMA SNAPSHOT');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t => t.name);
console.log('  Tables: ' + tables.join(', '));
['projects','contacts','engagements','time_entries','billing_records',
 'custom_field_definitions','project_custom_field_values','contact_custom_field_values',
 'custom_field_values','subtasks'].forEach(t => {
  const cols = db.prepare('PRAGMA table_info('+t+')').all().map(c => c.name);
  console.log('  ['+t+']: '+cols.join(', '));
});

// ── 2A. ORPHANED PROJECTS (contact_id IS NULL) ─────────────────────────────────

section('2A. ORPHANED PROJECTS — contact_id IS NULL');
const orphanedProjects = db.prepare(`
  SELECT id, client_name, period_label, status, created_at FROM projects
  WHERE contact_id IS NULL ORDER BY id
`).all();
if (orphanedProjects.length === 0) {
  ok('All projects have contact_id set.');
} else {
  warn(orphanedProjects.length + ' project(s) have contact_id = NULL:');
  orphanedProjects.forEach(p => row(`#${p.id}  "${p.client_name}"  period:${p.period_label||'—'}  status:${p.status}  created:${p.created_at.slice(0,10)}`));
}

// ── 2B. DANGLING REFERENCES ────────────────────────────────────────────────────

section('2B. DANGLING REFERENCES');

// Projects → engagements
const projBadEng = db.prepare(`
  SELECT p.id, p.client_name, p.engagement_id FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM engagements e WHERE e.id = p.engagement_id)
`).all();
if (projBadEng.length === 0) ok('All projects.engagement_id → valid engagements row.');
else { warn(projBadEng.length + ' project(s) point to missing engagement:'); projBadEng.forEach(p => row(`#${p.id} "${p.client_name}" → engagement #${p.engagement_id} (MISSING)`)); }

// Projects → contacts (non-null contact_id that points nowhere)
const projBadContact = db.prepare(`
  SELECT p.id, p.client_name, p.contact_id FROM projects p
  WHERE p.contact_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = p.contact_id)
`).all();
if (projBadContact.length === 0) ok('All non-null projects.contact_id → valid contacts row.');
else { warn(projBadContact.length + ' project(s) have non-null contact_id pointing to missing contact:'); projBadContact.forEach(p => row(`#${p.id} "${p.client_name}" → contact #${p.contact_id} (MISSING)`)); }

// time_entries → projects
const teBadProject = db.prepare(`
  SELECT te.id, te.engagement_id, te.project_id FROM time_entries te
  WHERE te.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = te.project_id)
`).all();
if (teBadProject.length === 0) ok('All time_entries.project_id (non-null) → valid projects row.');
else { warn(teBadProject.length + ' time_entries point to missing project:'); teBadProject.forEach(t => row(`te#${t.id} → project#${t.project_id} (MISSING)`)); }

// time_entries → engagements
const teBadEng = db.prepare(`
  SELECT te.id, te.engagement_id FROM time_entries te
  WHERE NOT EXISTS (SELECT 1 FROM engagements e WHERE e.id = te.engagement_id)
`).all();
if (teBadEng.length === 0) ok('All time_entries.engagement_id → valid engagements row.');
else { warn(teBadEng.length + ' time_entries point to missing engagement:'); teBadEng.forEach(t => row(`te#${t.id} → engagement#${t.engagement_id} (MISSING)`)); }

// billing_records → projects
const brBadProject = db.prepare(`
  SELECT br.id, br.project_id FROM billing_records br
  WHERE br.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = br.project_id)
`).all();
if (brBadProject.length === 0) ok('All billing_records.project_id (non-null) → valid projects row.');
else { warn(brBadProject.length + ' billing_records point to missing project:'); brBadProject.forEach(b => row(`br#${b.id} → project#${b.project_id} (MISSING)`)); }

// billing_records → engagements
const brBadEng = db.prepare(`
  SELECT br.id, br.engagement_id FROM billing_records br
  WHERE NOT EXISTS (SELECT 1 FROM engagements e WHERE e.id = br.engagement_id)
`).all();
if (brBadEng.length === 0) ok('All billing_records.engagement_id → valid engagements row.');
else { warn(brBadEng.length + ' billing_records point to missing engagement:'); brBadEng.forEach(b => row(`br#${b.id} → engagement#${b.engagement_id} (MISSING)`)); }

// project_custom_field_values → field_definitions
const pcfvBadDef = db.prepare(`
  SELECT pcfv.id, pcfv.project_id, pcfv.field_definition_id FROM project_custom_field_values pcfv
  WHERE NOT EXISTS (SELECT 1 FROM custom_field_definitions cfd WHERE cfd.id = pcfv.field_definition_id)
`).all();
if (pcfvBadDef.length === 0) ok('All project_custom_field_values.field_definition_id → valid definition.');
else { warn(pcfvBadDef.length + ' project custom values point to missing field definition:'); pcfvBadDef.forEach(v => row(`pcfv#${v.id} project#${v.project_id} → def#${v.field_definition_id} (MISSING)`)); }

// project_custom_field_values → projects
const pcfvBadProj = db.prepare(`
  SELECT pcfv.id, pcfv.project_id FROM project_custom_field_values pcfv
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = pcfv.project_id)
`).all();
if (pcfvBadProj.length === 0) ok('All project_custom_field_values.project_id → valid project.');
else { warn(pcfvBadProj.length + ' project custom values point to missing project:'); pcfvBadProj.forEach(v => row(`pcfv#${v.id} → project#${v.project_id} (MISSING)`)); }

// contact_custom_field_values → field_definitions
const ccfvBadDef = db.prepare(`
  SELECT ccfv.id, ccfv.contact_id, ccfv.field_definition_id FROM contact_custom_field_values ccfv
  WHERE NOT EXISTS (SELECT 1 FROM custom_field_definitions cfd WHERE cfd.id = ccfv.field_definition_id)
`).all();
if (ccfvBadDef.length === 0) ok('All contact_custom_field_values.field_definition_id → valid definition.');
else { warn(ccfvBadDef.length + ' contact custom values point to missing field definition:'); ccfvBadDef.forEach(v => row(`ccfv#${v.id} contact#${v.contact_id} → def#${v.field_definition_id} (MISSING)`)); }

// contact_custom_field_values → contacts
const ccfvBadContact = db.prepare(`
  SELECT ccfv.id, ccfv.contact_id FROM contact_custom_field_values ccfv
  WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = ccfv.contact_id)
`).all();
if (ccfvBadContact.length === 0) ok('All contact_custom_field_values.contact_id → valid contact.');
else { warn(ccfvBadContact.length + ' contact custom values point to missing contact:'); ccfvBadContact.forEach(v => row(`ccfv#${v.id} → contact#${v.contact_id} (MISSING)`)); }

// engagement custom_field_values → field_definitions
const cfvBadDef = db.prepare(`
  SELECT cfv.id, cfv.engagement_id, cfv.field_definition_id FROM custom_field_values cfv
  WHERE NOT EXISTS (SELECT 1 FROM custom_field_definitions cfd WHERE cfd.id = cfv.field_definition_id)
`).all();
if (cfvBadDef.length === 0) ok('All engagement custom_field_values.field_definition_id → valid definition.');
else { warn(cfvBadDef.length + ' engagement custom values point to missing field definition:'); cfvBadDef.forEach(v => row(`cfv#${v.id} eng#${v.engagement_id} → def#${v.field_definition_id} (MISSING)`)); }

// subtasks → projects and engagements
const stBadProj = db.prepare(`
  SELECT s.id, s.project_id FROM subtasks s
  WHERE s.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = s.project_id)
`).all();
if (stBadProj.length === 0) ok('All subtasks.project_id (non-null) → valid project.');
else { warn(stBadProj.length + ' subtasks point to missing project:'); stBadProj.forEach(s => row(`subtask#${s.id} → project#${s.project_id} (MISSING)`)); }

const stBadEng = db.prepare(`
  SELECT s.id, s.engagement_id FROM subtasks s
  WHERE NOT EXISTS (SELECT 1 FROM engagements e WHERE e.id = s.engagement_id)
`).all();
if (stBadEng.length === 0) ok('All subtasks.engagement_id → valid engagement.');
else { warn(stBadEng.length + ' subtasks point to missing engagement:'); stBadEng.forEach(s => row(`subtask#${s.id} → engagement#${s.engagement_id} (MISSING)`)); }

// ── 2C. UNLINKED TIME / BILLING ────────────────────────────────────────────────

section('2C. UNLINKED TIME ENTRIES AND BILLING (NULL project_id)');

const teNullProj = db.prepare(`SELECT id, engagement_id, staff_member, date FROM time_entries WHERE project_id IS NULL ORDER BY id`).all();
if (teNullProj.length === 0) {
  ok('All time_entries have project_id set.');
} else {
  warn(teNullProj.length + ' time_entries have project_id = NULL:');
  teNullProj.forEach(t => row(`te#${t.id} eng#${t.engagement_id} ${t.staff_member} ${t.date}`));
}

const brNullProj = db.prepare(`SELECT id, engagement_id FROM billing_records WHERE project_id IS NULL ORDER BY id`).all();
if (brNullProj.length === 0) {
  ok('All billing_records have project_id set.');
} else {
  warn(brNullProj.length + ' billing_records have project_id = NULL:');
  brNullProj.forEach(b => row(`br#${b.id} eng#${b.engagement_id}`));
}

// ── 2D. GROUP INTEGRITY ────────────────────────────────────────────────────────

section('2D. CLIENT GROUP INTEGRITY — groups of one');
const groupsOfOne = db.prepare(`
  SELECT client_group_id, COUNT(*) as cnt
  FROM contacts
  WHERE client_group_id IS NOT NULL
  GROUP BY client_group_id
  HAVING cnt = 1
`).all();
if (groupsOfOne.length === 0) {
  ok('No "group of one" contacts found.');
} else {
  warn(groupsOfOne.length + ' client_group_id(s) have only ONE member (half-saved grouping):');
  groupsOfOne.forEach(g => {
    const c = db.prepare('SELECT id, display_name FROM contacts WHERE client_group_id = ?').get(g.client_group_id);
    row(`group_id=${g.client_group_id}  contact#${c.id} "${c.display_name}"`);
  });
}

// ── 2E. INVALID STATUS ─────────────────────────────────────────────────────────

section('2E. INVALID PROJECT STATUSES');
const projectsWithBadStatus = db.prepare(`
  SELECT id, client_name, status FROM projects ORDER BY id
`).all().filter(p => !validStatusSet.has(p.status));
if (projectsWithBadStatus.length === 0) {
  ok('All project statuses are valid (match project_statuses table). Valid set: ' + allProjectStatuses.join(', '));
} else {
  warn(projectsWithBadStatus.length + ' project(s) have statuses not in project_statuses:');
  projectsWithBadStatus.forEach(p => row(`#${p.id} "${p.client_name}" status="${p.status}"`));
}

// ── 2F. JUNK / EMPTY RECORDS ──────────────────────────────────────────────────

section('2F. JUNK / EMPTY RECORDS');

// Junk projects: suspicious names AND zero linked time/billing
const allProjects = db.prepare('SELECT id, client_name, period_label, status, contact_id, created_at FROM projects ORDER BY id').all();
const junkProjects = allProjects.filter(p => {
  const name = (p.client_name || '').trim().toLowerCase();
  const isJunk = JUNK_PATTERNS.test(name) || JUNK_WORDS.some(w => name === w || name.startsWith(w+' '));
  if (!isJunk) return false;
  const te = db.prepare('SELECT COUNT(*) as n FROM time_entries WHERE project_id = ?').get(p.id).n;
  const br = db.prepare('SELECT COUNT(*) as n FROM billing_records WHERE project_id = ?').get(p.id).n;
  const st = db.prepare('SELECT COUNT(*) as n FROM subtasks WHERE project_id = ?').get(p.id).n;
  return (te + br + st) === 0;
});
if (junkProjects.length === 0) {
  ok('No obvious junk projects found.');
} else {
  warn(junkProjects.length + ' likely junk project(s) — suspicious name AND zero time/billing/subtasks:');
  junkProjects.forEach(p => {
    const cfv = db.prepare('SELECT COUNT(*) as n FROM project_custom_field_values WHERE project_id = ?').get(p.id).n;
    row(`#${p.id} "${p.client_name}" period:${p.period_label||'—'} status:${p.status} contact_id:${p.contact_id} cfv:${cfv} created:${p.created_at.slice(0,10)}`);
  });
}

// Junk contacts: suspicious names AND zero linked projects
const allContacts = db.prepare('SELECT id, display_name, client_code, status, created_at FROM contacts ORDER BY id').all();
const junkContacts = allContacts.filter(c => {
  const name = (c.display_name || '').trim().toLowerCase();
  const isJunk = JUNK_PATTERNS.test(name) || JUNK_WORDS.some(w => name === w || name.startsWith(w+' '));
  if (!isJunk) return false;
  const proj = db.prepare('SELECT COUNT(*) as n FROM projects WHERE contact_id = ?').get(c.id).n;
  return proj === 0;
});
if (junkContacts.length === 0) {
  ok('No obvious junk contacts found.');
} else {
  warn(junkContacts.length + ' likely junk contact(s) — suspicious name AND zero linked projects:');
  junkContacts.forEach(c => row(`#${c.id} "${c.display_name}" code:${c.client_code||'—'} status:${c.status} created:${c.created_at.slice(0,10)}`));
}

// Contacts with no display_name
const noName = db.prepare("SELECT id, type, client_code FROM contacts WHERE display_name IS NULL OR trim(display_name) = ''").all();
if (noName.length === 0) ok('All contacts have a display_name.');
else { warn(noName.length + ' contact(s) have blank display_name:'); noName.forEach(c => row(`#${c.id} type:${c.type} code:${c.client_code||'—'}`)); }

// ── 2G. FIELD-POPULATION CONSISTENCY ─────────────────────────────────────────

section('2G. FIELD-POPULATION CONSISTENCY (old vs recent projects)');

const totalProjects = db.prepare('SELECT COUNT(*) as n FROM projects').get().n;
if (totalProjects === 0) { ok('No projects to compare.'); }
else {
  // Split into first-half (older) and second-half (newer) by id ordering
  const midId = db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1 OFFSET '+Math.floor(totalProjects/2)).get()?.id || 0;

  const projectCols = ['contact_id','engagement_id','project_type','entity_type','period_label',
    'primary_partner','manager','preparer','reviewer','in_charge',
    'original_due','current_due','priority','client_number','engagement_number'];

  const oldCount  = db.prepare('SELECT COUNT(*) as n FROM projects WHERE id < ?').get(midId).n;
  const newCount  = db.prepare('SELECT COUNT(*) as n FROM projects WHERE id >= ?').get(midId).n;

  console.log(`  Splitting at id=${midId}: ${oldCount} older / ${newCount} newer projects`);

  const suspicious = [];
  for (const col of projectCols) {
    const oldPop = db.prepare(`SELECT COUNT(*) as n FROM projects WHERE id < ? AND ${col} IS NOT NULL`).get(midId).n;
    const newPop = db.prepare(`SELECT COUNT(*) as n FROM projects WHERE id >= ? AND ${col} IS NOT NULL`).get(midId).n;
    const oldPct = oldCount > 0 ? Math.round(oldPop/oldCount*100) : 0;
    const newPct = newCount > 0 ? Math.round(newPop/newCount*100) : 0;
    const gap    = oldPct - newPct;
    const marker = gap >= 30 ? ' *** SUSPICIOUS DROP ***' : (gap >= 15 ? ' * note' : '');
    console.log(`  ${col.padEnd(22)} old:${String(oldPct)+'%'}   new:${String(newPct)+'%'}${marker}`);
    if (gap >= 30) suspicious.push({ col, oldPct, newPct, gap });
  }

  if (suspicious.length === 0) {
    ok('No suspicious field-population drop between old and new projects.');
  } else {
    console.log('');
    warn(suspicious.length + ' field(s) show a large population drop on newer projects:');
    suspicious.forEach(s => row(`${s.col}: old=${s.oldPct}%  new=${s.newPct}%  drop=${s.gap}pp`));
  }
}

// ── 2H. ENGAGEMENTS WITH NO PROJECTS ──────────────────────────────────────────

section('2H. ENGAGEMENTS WITH NO PROJECTS (orphaned engagement containers)');
const engNoProj = db.prepare(`
  SELECT e.id, e.client_name, e.engagement_type, e.status FROM engagements e
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.engagement_id = e.id)
  ORDER BY e.id
`).all();
if (engNoProj.length === 0) {
  ok('All engagements have at least one project.');
} else {
  warn(engNoProj.length + ' engagement(s) have zero projects (may be OK if never had one, or junk):');
  engNoProj.forEach(e => row(`eng#${e.id} "${e.client_name}" type:${e.engagement_type} status:${e.status}`));
}

// ── 2I. MISMATCHED CLIENT NAMES ────────────────────────────────────────────────

section('2I. CLIENT NAME MISMATCHES (project.client_name ≠ contacts.display_name)');
const nameMismatch = db.prepare(`
  SELECT p.id, p.client_name as proj_name, c.display_name as contact_name
  FROM projects p
  JOIN contacts c ON c.id = p.contact_id
  WHERE p.client_name != c.display_name
  ORDER BY p.id
`).all();
if (nameMismatch.length === 0) {
  ok('All project.client_name values match their linked contact.display_name.');
} else {
  warn(nameMismatch.length + ' project(s) have client_name that differs from contact.display_name:');
  nameMismatch.forEach(m => row(`proj#${m.id}  project="${m.proj_name}"  contact="${m.contact_name}"`));
}

// ── SUMMARY ────────────────────────────────────────────────────────────────────

section('AUDIT SUMMARY');
if (totalIssues === 0) {
  ok('Database is CLEAN — no issues found.');
} else {
  warn(`${totalIssues} issue category/categories flagged above. Review each section.`);
}
console.log('');
