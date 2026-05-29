const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM automation_rules ORDER BY created_at ASC').all());
});

router.post('/', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config, active } = req.body;
  const r = db.prepare(`
    INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name, trigger_type,
    JSON.stringify(trigger_config || {}),
    action_type,
    JSON.stringify(action_config || {}),
    active !== false ? 1 : 0
  );
  res.status(201).json(db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config, active } = req.body;
  const r = db.prepare(`
    UPDATE automation_rules
    SET name=?, trigger_type=?, trigger_config=?, action_type=?, action_config=?, active=?
    WHERE id=?
  `).run(
    name, trigger_type,
    JSON.stringify(trigger_config || {}),
    action_type,
    JSON.stringify(action_config || {}),
    active !== false ? 1 : 0,
    req.params.id
  );
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(req.params.id));
});

router.patch('/:id/toggle', (req, res) => {
  const rule = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE automation_rules SET active = ? WHERE id = ?').run(rule.active ? 0 : 1, req.params.id);
  res.json(db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM automation_rules WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
