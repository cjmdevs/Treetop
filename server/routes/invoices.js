const express = require('express');
const db = require('../db/database');
const router = express.Router();

function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const last = db.prepare(
    "SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1"
  ).get(`TRT-${year}-%`);
  const seq = last ? parseInt(last.invoice_number.split('-')[2]) + 1 : 1;
  return `TRT-${year}-${String(seq).padStart(4, '0')}`;
}

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM invoices ORDER BY created_at DESC').all());
});

router.get('/:id', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  inv.line_items = db.prepare('SELECT * FROM invoice_line_items WHERE invoice_id = ?').all(inv.id);
  res.json(inv);
});

router.post('/generate/:billingRecordId', (req, res) => {
  const br = db.prepare(`
    SELECT b.*, e.client_name, e.engagement_type, e.id as eng_id
    FROM billing_records b
    JOIN engagements e ON e.id = b.engagement_id
    WHERE b.id = ?
  `).get(req.params.billingRecordId);
  if (!br) return res.status(404).json({ error: 'Billing record not found' });

  const timeEntries = db.prepare(
    'SELECT * FROM time_entries WHERE engagement_id = ? AND billable = 1 ORDER BY date ASC'
  ).all(br.engagement_id);

  const tax_rate  = parseFloat(req.body.tax_rate || 0);
  const subtotal  = br.invoice_amount;
  const tax_amount = Math.round(subtotal * tax_rate / 100 * 100) / 100;
  const total     = subtotal + tax_amount;
  const invoice_number = nextInvoiceNumber();
  const today    = new Date().toISOString().split('T')[0];
  const due_date = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const r = db.prepare(`
    INSERT INTO invoices
      (invoice_number, billing_record_id, engagement_id, client_name,
       invoice_date, due_date, tax_rate, subtotal, tax_amount, total, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(invoice_number, br.id, br.engagement_id, br.client_name,
         today, due_date, tax_rate, subtotal, tax_amount, total, req.body.notes || null);

  const invId = r.lastInsertRowid;

  if (timeEntries.length > 0) {
    timeEntries.forEach(te => {
      const amount = te.hours * (te.billing_rate || 0);
      db.prepare(`
        INSERT INTO invoice_line_items (invoice_id, description, date, service_code, staff_member, hours, rate, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invId,
             `${te.notes || br.engagement_type} — ${te.staff_member}`,
             te.date, te.service_code || null, te.staff_member, te.hours, te.billing_rate || 0, amount);
    });
  } else {
    db.prepare(
      'INSERT INTO invoice_line_items (invoice_id, description, amount) VALUES (?, ?, ?)'
    ).run(invId, br.engagement_type || 'Professional Services', subtotal);
  }

  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invId);
  inv.line_items = db.prepare('SELECT * FROM invoice_line_items WHERE invoice_id = ?').all(invId);
  res.status(201).json(inv);
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
