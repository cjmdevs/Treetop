const db = require('../db/database');

function log(event_type, entity_type, entity_id, description, staff_member = null, acted_by_name = null, acting_user_id = null) {
  let acted_by_initials = null;
  if (acting_user_id) {
    try {
      const u = db.prepare('SELECT initials FROM users WHERE id = ?').get(acting_user_id);
      acted_by_initials = u?.initials || null;
    } catch {}
  }
  try {
    db.prepare(`
      INSERT INTO activity_log (event_type, entity_type, entity_id, description, staff_member, acted_by_name, acted_by_initials)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(event_type, entity_type, entity_id, description, staff_member, acted_by_name, acted_by_initials);
  } catch {
    // Never crash the main request due to logging failure
  }
}

module.exports = { log };
