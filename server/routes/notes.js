const express = require('express');
const db = require('../db/database');
const router = express.Router();
const { log } = require('../lib/activityLogger');

router.get('/', (req, res) => {
  const { entity_type, entity_id } = req.query;
  let q = `
    SELECT n.*,
      CASE WHEN n.entity_type = 'client'
           THEN COALESCE(c.display_name, c.business_name)
           ELSE NULL
      END AS client_display_name
    FROM notes n
    LEFT JOIN contacts c ON c.id = n.entity_id AND n.entity_type = 'client'
    WHERE 1=1
  `;
  const p = [];
  if (entity_type) { q += ' AND n.entity_type = ?'; p.push(entity_type); }
  if (entity_id)   { q += ' AND n.entity_id = ?';   p.push(entity_id); }
  q += ' ORDER BY n.pinned DESC, n.created_at DESC';
  res.json(db.prepare(q).all(...p));
});

router.post('/', (req, res) => {
  const { entity_type, entity_id, note_text, category, priority_flag, created_by, pinned } = req.body;
  const r = db.prepare(`
    INSERT INTO notes (entity_type, entity_id, note_text, category, priority_flag, created_by, pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(entity_type, entity_id, note_text, category || 'General',
         priority_flag ? 1 : 0, created_by || null, pinned ? 1 : 0);
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(r.lastInsertRowid);
  log('note_added', entity_type, entity_id,
      `Note added: "${note_text.substring(0, 80)}${note_text.length > 80 ? '…' : ''}"`, created_by, req.user.full_name, req.user.id);
  res.status(201).json(note);
});

router.patch('/:id', (req, res) => {
  const { note_text, category, priority_flag, pinned } = req.body;
  const prev = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE notes SET note_text=?, category=?, priority_flag=?, pinned=? WHERE id=?
  `).run(
    note_text ?? prev.note_text,
    category ?? prev.category,
    priority_flag !== undefined ? (priority_flag ? 1 : 0) : prev.priority_flag,
    pinned !== undefined ? (pinned ? 1 : 0) : prev.pinned,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
