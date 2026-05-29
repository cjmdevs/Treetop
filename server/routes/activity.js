const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.get('/', (req, res) => {
  const { entity_type, entity_id, staff_member, limit = 50 } = req.query;
  let q = 'SELECT * FROM activity_log WHERE 1=1';
  const p = [];
  if (entity_type) { q += ' AND entity_type = ?'; p.push(entity_type); }
  if (entity_id)   { q += ' AND entity_id = ?';   p.push(entity_id); }
  if (staff_member){ q += ' AND staff_member = ?'; p.push(staff_member); }
  q += ` ORDER BY created_at DESC LIMIT ${parseInt(limit) || 50}`;
  res.json(db.prepare(q).all(...p));
});

module.exports = router;
