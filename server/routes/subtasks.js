const express = require('express');
const db = require('../db/database');
const router = express.Router({ mergeParams: true });
const { log }                 = require('../lib/activityLogger');
const { runSubtaskCompleted } = require('../lib/automationEngine');

router.get('/', (req, res) => {
  res.json(db.prepare(
    'SELECT * FROM subtasks WHERE engagement_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(req.params.engagementId));
});

router.post('/', (req, res) => {
  const { title, assigned_staff, status, due_date, sort_order, notes } = req.body;
  const r = db.prepare(`
    INSERT INTO subtasks (engagement_id, title, assigned_staff, status, due_date, sort_order, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.engagementId, title, assigned_staff || null,
         status || 'Not Started', due_date || null, sort_order ?? 0, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM subtasks WHERE id = ?').get(r.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const { title, assigned_staff, status, due_date, sort_order, notes } = req.body;
  const prev = db.prepare('SELECT * FROM subtasks WHERE id = ? AND engagement_id = ?')
    .get(req.params.id, req.params.engagementId);
  if (!prev) return res.status(404).json({ error: 'Not found' });

  const completed_at =
    status === 'Complete' && prev.status !== 'Complete'
      ? new Date().toISOString()
      : status !== 'Complete'
        ? null
        : prev.completed_at;

  db.prepare(`
    UPDATE subtasks SET title=?, assigned_staff=?, status=?, due_date=?, sort_order=?, notes=?, completed_at=?
    WHERE id=? AND engagement_id=?
  `).run(title ?? prev.title, assigned_staff ?? prev.assigned_staff,
         status ?? prev.status, due_date ?? prev.due_date,
         sort_order ?? prev.sort_order, notes ?? prev.notes,
         completed_at, req.params.id, req.params.engagementId);

  const updated = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.id);

  if (status === 'Complete' && prev.status !== 'Complete') {
    log('subtask_completed', 'engagement', req.params.engagementId,
        `Subtask completed: "${updated.title}"`, prev.assigned_staff);
    runSubtaskCompleted(req.params.engagementId, updated.title);
  }

  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM subtasks WHERE id=? AND engagement_id=?')
    .run(req.params.id, req.params.engagementId);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
