const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.get('/', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const like = `%${q}%`;

  const engagements = db.prepare(`
    SELECT 'engagement' as type, id, client_name as title, engagement_type as subtitle
    FROM engagements WHERE client_name LIKE ? OR notes LIKE ? LIMIT 5
  `).all(like, like);

  const notes = db.prepare(`
    SELECT 'note' as type, id, note_text as title,
      (entity_type || ' #' || entity_id) as subtitle
    FROM notes WHERE note_text LIKE ? LIMIT 5
  `).all(like);

  const invoices = db.prepare(`
    SELECT 'invoice' as type, id, invoice_number as title, client_name as subtitle
    FROM invoices WHERE invoice_number LIKE ? OR client_name LIKE ? LIMIT 5
  `).all(like, like);

  const staff = db.prepare(`
    SELECT DISTINCT 'staff' as type, 0 as id, assigned_staff as title, 'Staff Member' as subtitle
    FROM engagements WHERE assigned_staff LIKE ? AND assigned_staff IS NOT NULL LIMIT 5
  `).all(like);

  res.json([...engagements, ...notes, ...invoices, ...staff]);
});

module.exports = router;
