const db = require('../db/database');

function log(event_type, entity_type, entity_id, description, staff_member = null) {
  try {
    db.prepare(`
      INSERT INTO activity_log (event_type, entity_type, entity_id, description, staff_member)
      VALUES (?, ?, ?, ?, ?)
    `).run(event_type, entity_type, entity_id, description, staff_member);
  } catch {
    // Never crash the main request due to logging failure
  }
}

module.exports = { log };
