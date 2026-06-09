const express = require('express');
const db = require('../db/database');
const router = express.Router();
const { log } = require('../lib/activityLogger');

// /summary must be declared before /:id so Express doesn't treat "summary" as an ID
router.get('/summary', (req, res) => {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status='Unbilled'  THEN invoice_amount ELSE 0 END), 0) AS unbilled_total,
      COALESCE(SUM(CASE WHEN status='Invoiced'  THEN invoice_amount ELSE 0 END), 0) AS invoiced_total,
      COALESCE(SUM(CASE WHEN status='Paid'      THEN invoice_amount ELSE 0 END), 0) AS paid_total,
      COUNT(CASE WHEN status='Unbilled'  THEN 1 END) AS unbilled_count,
      COUNT(CASE WHEN status='Invoiced'  THEN 1 END) AS invoiced_count,
      COUNT(CASE WHEN status='Paid'      THEN 1 END) AS paid_count
    FROM billing_records
  `).get();
  res.json(row);
});

router.get('/', (req, res) => {
  const { engagement_id, status } = req.query;
  let query = `
    SELECT b.*, e.client_name, e.engagement_type
    FROM billing_records b
    JOIN engagements e ON b.engagement_id = e.id
    WHERE 1=1
  `;
  const params = [];
  if (engagement_id) { query += ' AND b.engagement_id = ?'; params.push(engagement_id); }
  if (status)        { query += ' AND b.status = ?';        params.push(status); }
  query += ' ORDER BY b.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { engagement_id, invoice_amount, status, invoice_date, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO billing_records (engagement_id, invoice_amount, status, invoice_date, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(engagement_id, invoice_amount, status || 'Unbilled', invoice_date || null, notes || null);
  const record = db.prepare('SELECT * FROM billing_records WHERE id = ?').get(result.lastInsertRowid);
  log('billing_created', 'engagement', engagement_id,
      `Billing record created: $${invoice_amount} (${status || 'Unbilled'})`, null, req.user.full_name);
  res.status(201).json(record);
});

router.put('/:id', (req, res) => {
  const { engagement_id, invoice_amount, status, invoice_date, notes } = req.body;
  const prevRecord = db.prepare('SELECT * FROM billing_records WHERE id = ?').get(req.params.id);
  const result = db.prepare(`
    UPDATE billing_records
    SET engagement_id=?, invoice_amount=?, status=?, invoice_date=?, notes=?
    WHERE id=?
  `).run(engagement_id, invoice_amount, status, invoice_date || null, notes || null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  if (prevRecord && status !== prevRecord.status)
    log('billing_updated', 'engagement', engagement_id,
        `Invoice status: "${prevRecord.status}" → "${status}"`, null, req.user.full_name);
  res.json(db.prepare('SELECT * FROM billing_records WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM billing_records WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
