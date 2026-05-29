const express = require('express');
const db = require('../db/database');
const router = express.Router();

// GET /api/contact-client-types
router.get('/', (req, res) => {
  const { include_inactive } = req.query;
  const types = db.prepare(
    include_inactive === 'true'
      ? 'SELECT * FROM contact_client_types ORDER BY sort_order ASC, label ASC'
      : 'SELECT * FROM contact_client_types WHERE active = 1 ORDER BY sort_order ASC, label ASC'
  ).all();
  res.json(types);
});

// POST /api/contact-client-types
router.post('/', (req, res) => {
  const { code, label, sort_order } = req.body;
  if (!code || !label) return res.status(400).json({ error: 'code and label are required' });

  try {
    const r = db.prepare(
      'INSERT INTO contact_client_types (code, label, sort_order) VALUES (?, ?, ?)'
    ).run(code.trim(), label.trim(), sort_order ?? 0);
    res.status(201).json(db.prepare('SELECT * FROM contact_client_types WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Code already exists' });
    throw err;
  }
});

// PUT /api/contact-client-types/:id
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM contact_client_types WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { code, label, sort_order, active } = req.body;

  try {
    db.prepare(
      'UPDATE contact_client_types SET code=?, label=?, sort_order=?, active=? WHERE id=?'
    ).run(
      code ?? existing.code,
      label ?? existing.label,
      sort_order ?? existing.sort_order,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM contact_client_types WHERE id = ?').get(req.params.id));
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Code already exists' });
    throw err;
  }
});

// DELETE /api/contact-client-types/:id
router.delete('/:id', (req, res) => {
  const type = db.prepare('SELECT * FROM contact_client_types WHERE id = ?').get(req.params.id);
  if (!type) return res.status(404).json({ error: 'Not found' });

  const { c } = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE client_type = ?').get(type.code);
  if (c > 0) return res.status(409).json({ error: `In use by ${c} contact(s) — deactivate instead of deleting.` });

  db.prepare('DELETE FROM contact_client_types WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

module.exports = router;
