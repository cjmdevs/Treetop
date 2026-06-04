// One-time idempotent backfill: link projects.contact_id for projects where it is NULL
// Safe to re-run — only touches rows where contact_id IS NULL and a match is found.
// Usage: node server/db/backfill-contact-id.js

const db = require('./database');

const orphans = db.prepare(
  'SELECT id, client_name FROM projects WHERE contact_id IS NULL ORDER BY id'
).all();

console.log(`Found ${orphans.length} project(s) with contact_id = NULL\n`);

if (orphans.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

const linked   = [];
const unmatched = [];

for (const project of orphans) {
  const contact = db.prepare(`
    SELECT id FROM contacts
    WHERE lower(trim(display_name)) = lower(trim(?))
       OR lower(trim(business_name)) = lower(trim(?))
    LIMIT 1
  `).get(project.client_name, project.client_name);

  if (contact) {
    db.prepare('UPDATE projects SET contact_id = ? WHERE id = ? AND contact_id IS NULL')
      .run(contact.id, project.id);
    linked.push({ project_id: project.id, client_name: project.client_name, contact_id: contact.id });
  } else {
    unmatched.push({ project_id: project.id, client_name: project.client_name });
  }
}

console.log(`Linked ${linked.length} project(s):`);
for (const r of linked) {
  console.log(`  Project #${r.project_id} "${r.client_name}" → contact_id ${r.contact_id}`);
}

console.log(`\nCould not match ${unmatched.length} project(s) (no contact with that exact name):`);
for (const r of unmatched) {
  console.log(`  Project #${r.project_id} "${r.client_name}"`);
}
