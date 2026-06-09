const express = require('express');
const db      = require('../db/database');
const router  = express.Router();

const FIRM_KEYS = ['firm_name', 'firm_address_block'];

// GET /api/firm-settings — any authenticated user can read (invoice view needs it)
router.get('/', (req, res) => {
  const result = {};
  FIRM_KEYS.forEach(key => {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
    result[key] = row?.value || '';
  });
  res.json(result);
});

// PUT /api/firm-settings — admin only
router.put('/', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  FIRM_KEYS.forEach(key => {
    const value = String(req.body[key] ?? '');
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  });

  res.json({
    firm_name:          req.body.firm_name          || '',
    firm_address_block: req.body.firm_address_block || '',
  });
});

module.exports = router;
