// Dry-run report + optional hard delete for orphaned projects (contact_id IS NULL).
//
// Usage:
//   node db/cleanup-junk.js                        — dry-run report, no changes
//   node db/cleanup-junk.js --delete --ids 13,14   — delete only those project ids
//
// Safe to re-run at any time. Deletion cascades all dependent rows and reports
// exactly what will be removed before doing it.

const db = require('./database');

const args = process.argv.slice(2);
const doDelete = args.includes('--delete');
const idsArg   = args.find(a => a.startsWith('--ids=')) || (args.indexOf('--ids') !== -1 ? '--ids=' + args[args.indexOf('--ids') + 1] : null);
const targetIds = idsArg ? idsArg.replace('--ids=', '').split(',').map(Number).filter(Boolean) : [];

if (doDelete && targetIds.length === 0) {
  console.error('ERROR: --delete requires --ids <comma-separated project ids>');
  process.exit(1);
}

// ── Dependency counts ────────────────────────────────────────────────────────

function getDeps(projectId) {
  return {
    time_entries:              db.prepare('SELECT COUNT(*) as n FROM time_entries WHERE project_id=?').get(projectId).n,
    billing_records:           db.prepare('SELECT COUNT(*) as n FROM billing_records WHERE project_id=?').get(projectId).n,
    subtasks:                  db.prepare('SELECT COUNT(*) as n FROM subtasks WHERE project_id=?').get(projectId).n,
    project_custom_field_values: db.prepare('SELECT COUNT(*) as n FROM project_custom_field_values WHERE project_id=?').get(projectId).n,
  };
}

// ── DRY-RUN REPORT ───────────────────────────────────────────────────────────

const orphans = db.prepare(
  'SELECT id, client_name, engagement_id, period_label FROM projects WHERE contact_id IS NULL ORDER BY id'
).all();

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  ORPHANED PROJECTS (contact_id IS NULL) — DRY-RUN REPORT');
console.log('══════════════════════════════════════════════════════════════\n');

if (orphans.length === 0) {
  console.log('  No orphaned projects. Nothing to do.\n');
} else {
  for (const p of orphans) {
    const deps = getDeps(p.id);
    const depStr = Object.entries(deps)
      .map(([k, n]) => `${k}: ${n}`)
      .join('  |  ');
    console.log(`  #${p.id}  "${p.client_name}"  (period: ${p.period_label || '—'}, engagement_id: ${p.engagement_id})`);
    console.log(`        dependents → ${depStr}`);
    console.log();
  }
}

// ── Also report junk-looking contacts with zero real projects ────────────────

const contactsWithNoProjects = db.prepare(`
  SELECT c.id, c.display_name, c.business_name, c.client_code
  FROM contacts c
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.contact_id = c.id)
  ORDER BY c.id
`).all();

console.log('──────────────────────────────────────────────────────────────');
console.log('  CONTACTS WITH ZERO LINKED PROJECTS (for review, not auto-deleted)');
console.log('──────────────────────────────────────────────────────────────\n');

if (contactsWithNoProjects.length === 0) {
  console.log('  None.\n');
} else {
  for (const c of contactsWithNoProjects) {
    console.log(`  contact #${c.id}  "${c.display_name || c.business_name}"  code: ${c.client_code || '—'}`);
  }
  console.log();
}

if (!doDelete) {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  DRY-RUN ONLY — no changes made.');
  console.log('  To delete specific projects:');
  console.log('    node db/cleanup-junk.js --delete --ids 13,14,15');
  console.log('══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

// ── DELETION ─────────────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════════════');
console.log(`  DELETING projects: ${targetIds.join(', ')}`);
console.log('══════════════════════════════════════════════════════════════\n');

const deleteProject = db.transaction((projectId) => {
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  if (!project) {
    console.log(`  #${projectId} — NOT FOUND, skipping`);
    return;
  }
  if (project.contact_id !== null) {
    console.log(`  #${projectId} — has contact_id=${project.contact_id}, SKIPPING (safety: only delete orphans)`);
    return;
  }

  const deps = getDeps(projectId);
  console.log(`  Deleting #${projectId} "${project.client_name}":`);
  for (const [table, count] of Object.entries(deps)) {
    if (count > 0) {
      db.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(projectId);
      console.log(`    deleted ${count} row(s) from ${table}`);
    }
  }
  db.prepare('DELETE FROM projects WHERE id=?').run(projectId);
  console.log(`    deleted project #${projectId}\n`);
});

for (const id of targetIds) {
  deleteProject(id);
}

console.log('Done.\n');
