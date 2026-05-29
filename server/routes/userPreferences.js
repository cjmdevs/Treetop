const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.get('/:key', (req, res) => {
  const pref = db.prepare(
    'SELECT pref_value FROM user_preferences WHERE user_id = ? AND pref_key = ?'
  ).get(req.user.id, req.params.key);
  res.json({ value: pref ? JSON.parse(pref.pref_value) : null });
});

router.put('/:key', (req, res) => {
  const { value } = req.body;
  db.prepare(`
    INSERT INTO user_preferences (user_id, pref_key, pref_value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, pref_key)
    DO UPDATE SET pref_value = excluded.pref_value, updated_at = datetime('now')
  `).run(req.user.id, req.params.key, JSON.stringify(value));
  res.json({ ok: true });
});

module.exports = router;
