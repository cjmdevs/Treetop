const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.get('/upcoming', (req, res) => {
  const { days = 90 } = req.query;
  const today   = new Date().toISOString().split('T')[0];
  const future  = new Date(Date.now() + parseInt(days) * 86400000).toISOString().split('T')[0];
  const engagements = db.prepare(`
    SELECT * FROM engagements
    WHERE due_date >= ? AND due_date <= ? AND status NOT IN ('Complete', 'On Hold')
    ORDER BY due_date ASC
  `).all(today, future);

  const overdue = db.prepare(`
    SELECT * FROM engagements
    WHERE due_date < ? AND status NOT IN ('Complete', 'On Hold')
    ORDER BY due_date ASC
  `).all(today);

  res.json({ upcoming: engagements, overdue });
});

router.get('/tax-deadlines', (req, res) => {
  res.json(db.prepare('SELECT * FROM tax_deadlines ORDER BY month ASC, day ASC').all());
});

module.exports = router;
