const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.get('/definitions', (req, res) => {
  res.json(db.prepare('SELECT * FROM custom_field_definitions ORDER BY sort_order ASC').all());
});

router.post('/definitions', (req, res) => {
  const { field_name, field_type, dropdown_options, sort_order } = req.body;
  const r = db.prepare(`
    INSERT INTO custom_field_definitions (field_name, field_type, dropdown_options, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(field_name, field_type || 'Text',
         dropdown_options ? JSON.stringify(dropdown_options) : null, sort_order ?? 0);
  res.status(201).json(db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/definitions/:id', (req, res) => {
  const { field_name, field_type, dropdown_options, sort_order } = req.body;
  const r = db.prepare(`
    UPDATE custom_field_definitions SET field_name=?, field_type=?, dropdown_options=?, sort_order=? WHERE id=?
  `).run(field_name, field_type || 'Text',
         dropdown_options ? JSON.stringify(dropdown_options) : null, sort_order ?? 0, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(req.params.id));
});

router.delete('/definitions/:id', (req, res) => {
  const r = db.prepare('DELETE FROM custom_field_definitions WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

router.get('/values/:engagementId', (req, res) => {
  res.json(db.prepare(`
    SELECT cfv.*, cfd.field_name, cfd.field_type, cfd.dropdown_options
    FROM custom_field_values cfv
    JOIN custom_field_definitions cfd ON cfd.id = cfv.field_definition_id
    WHERE cfv.engagement_id = ?
  `).all(req.params.engagementId));
});

router.post('/values/:engagementId', (req, res) => {
  const { field_definition_id, value } = req.body;
  db.prepare(`
    INSERT INTO custom_field_values (engagement_id, field_definition_id, value)
    VALUES (?, ?, ?)
    ON CONFLICT(engagement_id, field_definition_id) DO UPDATE SET value=excluded.value
  `).run(req.params.engagementId, field_definition_id, value ?? null);
  res.status(200).json({ ok: true });
});

// ── Project-scoped custom field endpoints ─────────────────────────────────────
router.get('/definitions/project', (req, res) => {
  res.json(db.prepare(
    "SELECT * FROM custom_field_definitions WHERE scope='project' ORDER BY sort_order ASC"
  ).all());
});

router.get('/project-values/:projectId', (req, res) => {
  res.json(db.prepare(`
    SELECT pcfv.*, cfd.field_name, cfd.field_type, cfd.dropdown_options
    FROM project_custom_field_values pcfv
    JOIN custom_field_definitions cfd ON cfd.id = pcfv.field_definition_id
    WHERE pcfv.project_id = ?
  `).all(req.params.projectId));
});

router.post('/project-values/:projectId', (req, res) => {
  const { field_definition_id, value } = req.body;
  if (!field_definition_id) return res.status(400).json({ error: 'field_definition_id required' });
  db.prepare(`
    INSERT INTO project_custom_field_values (project_id, field_definition_id, value)
    VALUES (?, ?, ?)
    ON CONFLICT(project_id, field_definition_id) DO UPDATE SET value = excluded.value
  `).run(req.params.projectId, field_definition_id, value ?? null);
  res.json({ ok: true });
});

module.exports = router;
