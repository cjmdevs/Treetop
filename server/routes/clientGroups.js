const express = require('express');
const db = require('../db/database');
const router = express.Router();

// GET /api/client-groups
router.get('/', (req, res) => {
  const groups = db.prepare(`
    SELECT g.*,
      COUNT(c.id) AS member_count
    FROM client_groups g
    LEFT JOIN contacts c ON c.client_group_id = g.id
    GROUP BY g.id
    ORDER BY g.name ASC
  `).all();
  res.json(groups);
});

// POST /api/client-groups
router.post('/', (req, res) => {
  const { name, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare(
    'INSERT INTO client_groups (name, notes) VALUES (?, ?)'
  ).run(name.trim(), notes || null);
  res.status(201).json(db.prepare('SELECT * FROM client_groups WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/client-groups/:id
router.put('/:id', (req, res) => {
  const { name, notes } = req.body;
  const group = db.prepare('SELECT * FROM client_groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE client_groups SET name=?, notes=? WHERE id=?').run(
    name ?? group.name, notes !== undefined ? notes : group.notes, req.params.id
  );
  res.json(db.prepare('SELECT * FROM client_groups WHERE id = ?').get(req.params.id));
});

// DELETE /api/client-groups/:id
router.delete('/:id', (req, res) => {
  const group = db.prepare('SELECT * FROM client_groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Not found' });
  // Unassign all contacts first
  db.prepare('UPDATE contacts SET client_group_id = NULL WHERE client_group_id = ?').run(req.params.id);
  db.prepare('DELETE FROM client_groups WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/client-groups/:id/members
router.get('/:id/members', (req, res) => {
  const group = db.prepare('SELECT * FROM client_groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Not found' });
  const members = db.prepare(
    'SELECT id, display_name, type, status, client_code, email_primary FROM contacts WHERE client_group_id = ? ORDER BY display_name ASC'
  ).all(req.params.id);
  res.json({ ...group, members });
});

// POST /api/client-groups/:id/members — add a contact to this group
router.post('/:id/members', (req, res) => {
  const { contact_id } = req.body;
  if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
  const group = db.prepare('SELECT * FROM client_groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  db.prepare('UPDATE contacts SET client_group_id = ? WHERE id = ?').run(req.params.id, contact_id);
  const members = db.prepare(
    'SELECT id, display_name, type, status, client_code FROM contacts WHERE client_group_id = ? ORDER BY display_name ASC'
  ).all(req.params.id);
  res.json({ ...group, members });
});

// DELETE /api/client-groups/:id/members/:contactId — remove a contact from this group
router.delete('/:id/members/:contactId', (req, res) => {
  db.prepare('UPDATE contacts SET client_group_id = NULL WHERE id = ? AND client_group_id = ?').run(
    req.params.contactId, req.params.id
  );
  const members = db.prepare(
    'SELECT id, display_name, type, status, client_code FROM contacts WHERE client_group_id = ? ORDER BY display_name ASC'
  ).all(req.params.id);
  res.json({ members });
});

module.exports = router;
