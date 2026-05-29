const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.get('/', (req, res) => {
  const templates = db.prepare('SELECT * FROM workflow_templates ORDER BY name ASC').all();
  res.json(templates.map(t => ({
    ...t,
    subtasks: db.prepare('SELECT * FROM template_subtasks WHERE template_id = ? ORDER BY sort_order ASC').all(t.id),
  })));
});

router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.subtasks = db.prepare('SELECT * FROM template_subtasks WHERE template_id = ? ORDER BY sort_order ASC').all(t.id);
  res.json(t);
});

router.post('/', (req, res) => {
  const { name, engagement_type, default_priority, subtasks = [] } = req.body;
  const r = db.prepare(
    'INSERT INTO workflow_templates (name, engagement_type, default_priority) VALUES (?, ?, ?)'
  ).run(name, engagement_type, default_priority || 'Medium');
  const id = r.lastInsertRowid;
  subtasks.forEach((s, i) => {
    db.prepare('INSERT INTO template_subtasks (template_id, title, default_assignee_role, sort_order) VALUES (?, ?, ?, ?)')
      .run(id, s.title, s.default_assignee_role || null, i);
  });
  const tmpl = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id);
  tmpl.subtasks = db.prepare('SELECT * FROM template_subtasks WHERE template_id = ? ORDER BY sort_order ASC').all(id);
  res.status(201).json(tmpl);
});

router.put('/:id', (req, res) => {
  const { name, engagement_type, default_priority, subtasks = [] } = req.body;
  const r = db.prepare(
    'UPDATE workflow_templates SET name=?, engagement_type=?, default_priority=? WHERE id=?'
  ).run(name, engagement_type, default_priority || 'Medium', req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM template_subtasks WHERE template_id = ?').run(req.params.id);
  subtasks.forEach((s, i) => {
    db.prepare('INSERT INTO template_subtasks (template_id, title, default_assignee_role, sort_order) VALUES (?, ?, ?, ?)')
      .run(req.params.id, s.title, s.default_assignee_role || null, i);
  });
  const tmpl = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id);
  tmpl.subtasks = db.prepare('SELECT * FROM template_subtasks WHERE template_id = ? ORDER BY sort_order ASC').all(req.params.id);
  res.json(tmpl);
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM workflow_templates WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
