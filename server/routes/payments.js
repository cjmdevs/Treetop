const express = require('express');
const db = require('../db/database');
const router = express.Router();
const { log } = require('../lib/activityLogger');

router.get('/aging', (req, res) => {
  const unpaid = db.prepare(`
    SELECT b.*, e.client_name, e.engagement_type
    FROM billing_records b
    JOIN engagements e ON e.id = b.engagement_id
    WHERE b.status IN ('Unbilled', 'Invoiced')
    ORDER BY b.created_at ASC
  `).all();

  const today = new Date();
  const buckets = { current: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
  const records = unpaid.map(r => {
    const refDate = new Date(r.invoice_date || r.created_at);
    const days = Math.floor((today - refDate) / 86400000);
    let bucket;
    if (days <= 30)      { bucket = 'current';   buckets.current    += r.invoice_amount; }
    else if (days <= 60) { bucket = '31-60';     buckets.days31_60  += r.invoice_amount; }
    else if (days <= 90) { bucket = '61-90';     buckets.days61_90  += r.invoice_amount; }
    else                 { bucket = '90+';       buckets.days90plus += r.invoice_amount; }
    return { ...r, days_outstanding: days, bucket };
  });

  res.json({ buckets, records });
});

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM payments ORDER BY payment_date DESC').all());
});

router.post('/', (req, res) => {
  const { client_name, amount, payment_date, payment_method, reference_number, notes } = req.body;
  const r = db.prepare(`
    INSERT INTO payments (client_name, amount, payment_date, payment_method, reference_number, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(client_name, parseFloat(amount), payment_date,
         payment_method || 'Check', reference_number || null, notes || null);
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(r.lastInsertRowid);
  log('payment_received', 'payment', r.lastInsertRowid,
      `Payment received: $${amount} from ${client_name} (${payment_method || 'Check'})`, null, req.user.full_name);
  res.status(201).json(payment);
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
