const db = require('../db/database');

function log(event_type, entity_type, entity_id, description, staff_member = null, acted_by_name = null) {
  try {
    db.prepare(`
      INSERT INTO activity_log (event_type, entity_type, entity_id, description, staff_member, acted_by_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(event_type, entity_type, entity_id, description, staff_member, acted_by_name);
  } catch {
    // Never crash the main request due to logging failure
  }
}

module.exports = { log };
