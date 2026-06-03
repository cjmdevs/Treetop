const express = require('express');
const db = require('../db/database');
const router = express.Router();

function maskSSN(ssn) {
  if (!ssn) return null;
  const clean = ssn.replace(/\D/g, '');
  return clean.length >= 4 ? `XXX-XX-${clean.slice(-4)}` : 'XXX-XX-XXXX';
}

function maskEIN(ein) {
  if (!ein) return null;
  const clean = ein.replace(/\D/g, '');
  return clean.length >= 4 ? `XX-XXX${clean.slice(-4)}` : 'XX-XXXXXXX';
}

function applyMasks(c) {
  if (!c) return c;
  return {
    ...c,
    ssn: maskSSN(c.ssn),
    spouse_ssn: maskSSN(c.spouse_ssn),
    federal_ein: maskEIN(c.federal_ein),
  };
}

// GET /api/contacts/meta/tags — must come before /:id
router.get('/meta/tags', (req, res) => {
  const tags = db.prepare(
    'SELECT DISTINCT tag FROM contact_tags ORDER BY tag ASC'
  ).all().map(r => r.tag);
  res.json({ tags });
});

// GET /api/contacts/meta/client-types — must come before /:id
router.get('/meta/client-types', (req, res) => {
  const types = db.prepare(
    'SELECT * FROM contact_client_types WHERE active = 1 ORDER BY sort_order ASC, label ASC'
  ).all();
  res.json({ types });
});

// GET /api/contacts
router.get('/', (req, res) => {
  const { search, type, client_type, status, tag, entity_type, staff_user_id, sort } = req.query;

  let query = `
    SELECT c.*,
      (SELECT GROUP_CONCAT(ct.tag, '||') FROM contact_tags ct WHERE ct.contact_id = c.id) AS tags_raw,
      (SELECT u.full_name FROM contact_staff_assignments csa
       JOIN users u ON u.id = csa.user_id
       WHERE csa.contact_id = c.id AND csa.role = 'Primary Partner' LIMIT 1) AS primary_partner
    FROM contacts c
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (c.display_name LIKE ? OR c.client_code LIKE ? OR c.email_primary LIKE ? OR c.phone_1 LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (type)           { query += ' AND c.type = ?'; params.push(type); }
  if (client_type)    { query += ' AND c.client_type = ?'; params.push(client_type); }
  if (status)         { query += ' AND c.status = ?'; params.push(status); }
  if (entity_type)    { query += ' AND c.entity_type = ?'; params.push(entity_type); }
  if (tag) {
    query += ' AND EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag = ?)';
    params.push(tag);
  }
  if (staff_user_id) {
    query += ' AND EXISTS (SELECT 1 FROM contact_staff_assignments csa WHERE csa.contact_id = c.id AND csa.user_id = ?)';
    params.push(staff_user_id);
  }

  const sortMap = {
    name_asc:     'c.display_name ASC',
    name_desc:    'c.display_name DESC',
    client_code:  'c.client_code ASC',
    created_desc: 'c.created_at DESC',
    created_asc:  'c.created_at ASC',
    updated:      'c.updated_at DESC',
  };
  query += ` ORDER BY ${sortMap[sort] || 'c.display_name ASC'}`;

  const contacts = db.prepare(query).all(...params);
  res.json(contacts.map(c => ({
    ...applyMasks(c),
    tags: c.tags_raw ? c.tags_raw.split('||') : [],
    tags_raw: undefined,
  })));
});

// GET /api/contacts/:id
router.get('/:id', (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const assignments = db.prepare(`
    SELECT csa.id, csa.role, csa.user_id, u.full_name
    FROM contact_staff_assignments csa
    JOIN users u ON u.id = csa.user_id
    WHERE csa.contact_id = ?
    ORDER BY csa.role ASC
  `).all(req.params.id);

  const tags = db.prepare(
    'SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag ASC'
  ).all(req.params.id).map(r => r.tag);

  const affiliates = db.prepare(`
    SELECT ca.id, ca.relationship_label, ca.affiliated_contact_id,
      c.display_name, c.type, c.status, c.client_code, c.email_primary
    FROM contact_affiliates ca
    JOIN contacts c ON c.id = ca.affiliated_contact_id
    WHERE ca.contact_id = ?
    ORDER BY c.display_name ASC
  `).all(req.params.id);

  const activity = db.prepare(`
    SELECT cal.*, u.full_name AS logged_by
    FROM contact_activity_log cal
    LEFT JOIN users u ON u.id = cal.user_id
    WHERE cal.contact_id = ?
    ORDER BY cal.created_at DESC
  `).all(req.params.id);

  const engagements = db.prepare(`
    SELECT e.*,
      COALESCE(SUM(te.hours), 0) AS actual_hours,
      COALESCE(SUM(CASE WHEN te.billable = 1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END), 0) AS actual_amount
    FROM engagements e
    LEFT JOIN time_entries te ON te.engagement_id = e.id
    WHERE e.client_name = ?
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).all(contact.display_name);

  let referred_by_contact = null;
  if (contact.referred_by_contact_id) {
    referred_by_contact = db.prepare(
      'SELECT id, display_name FROM contacts WHERE id = ?'
    ).get(contact.referred_by_contact_id);
  }

  let client_group = null;
  let group_members = [];
  if (contact.client_group_id) {
    client_group = db.prepare('SELECT * FROM client_groups WHERE id = ?').get(contact.client_group_id);
    group_members = db.prepare(
      'SELECT id, display_name, type, status, client_code FROM contacts WHERE client_group_id = ? ORDER BY display_name ASC'
    ).all(contact.client_group_id);
  }

  res.json({
    ...applyMasks(contact),
    assignments,
    tags,
    affiliates,
    activity,
    engagements,
    referred_by_contact,
    client_group,
    group_members,
  });
});

// GET /api/contacts/:id/reveal-sensitive
router.get('/:id/reveal-sensitive', (req, res) => {
  const contact = db.prepare(
    'SELECT ssn, spouse_ssn, federal_ein FROM contacts WHERE id = ?'
  ).get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  res.json(contact);
});

function buildDisplayName(type, body) {
  if (type === 'individual') {
    const fn = body.first_name || '';
    const ln = body.last_name || '';
    return ln && fn ? `${ln}, ${fn}` : ln || fn || '';
  }
  return body.business_name || '';
}

function applyAssignments(contactId, assignments) {
  db.prepare('DELETE FROM contact_staff_assignments WHERE contact_id = ?').run(contactId);
  if (!Array.isArray(assignments)) return;
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO contact_staff_assignments (contact_id, role, user_id) VALUES (?, ?, ?)'
  );
  assignments.forEach(a => { if (a.user_id && a.role) stmt.run(contactId, a.role, a.user_id); });
}

function applyTags(contactId, tags) {
  db.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(contactId);
  if (!Array.isArray(tags)) return;
  const stmt = db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag) VALUES (?, ?)');
  tags.forEach(tag => { if (tag) stmt.run(contactId, tag); });
}

// POST /api/contacts
router.post('/', (req, res) => {
  const b = req.body;

  if (b.client_code) {
    const dup = db.prepare('SELECT id FROM contacts WHERE client_code = ?').get(b.client_code);
    if (dup) return res.status(400).json({ error: 'Client code already in use' });
  }

  const display_name = buildDisplayName(b.type || 'individual', b);

  const r = db.prepare(`
    INSERT INTO contacts (
      type, status, display_name,
      first_name, last_name, ssn, spouse_first_name, spouse_last_name, spouse_ssn, date_of_birth,
      business_name, entity_type, federal_ein, fye_month, client_code, client_type,
      address_1, address_2, address_3, city, state, zip, country,
      mailing_address_1, mailing_address_2, mailing_city, mailing_state, mailing_zip, mailing_country,
      phone_1, phone_1_label, phone_2, phone_2_label, phone_3, phone_3_label, fax,
      email_primary, email_secondary, website,
      referral_source, referred_by_contact_id, naic_code, line_of_business, department, notes,
      created_by
    ) VALUES (
      ?,?,?,  ?,?,?,?,?,?,?,  ?,?,?,?,?,?,  ?,?,?,?,?,?,?,
      ?,?,?,?,?,?,  ?,?,?,?,?,?,?,  ?,?,?,  ?,?,?,?,?,?,  ?
    )
  `).run(
    b.type || 'individual', b.status || 'active', display_name,
    b.first_name || null, b.last_name || null, b.ssn || null,
    b.spouse_first_name || null, b.spouse_last_name || null, b.spouse_ssn || null, b.date_of_birth || null,
    b.business_name || null, b.entity_type || null, b.federal_ein || null, b.fye_month || null,
    b.client_code || null, b.client_type || null,
    b.address_1 || null, b.address_2 || null, b.address_3 || null,
    b.city || null, b.state || null, b.zip || null, b.country || 'USA',
    b.mailing_address_1 || null, b.mailing_address_2 || null,
    b.mailing_city || null, b.mailing_state || null, b.mailing_zip || null, b.mailing_country || null,
    b.phone_1 || null, b.phone_1_label || 'Mobile',
    b.phone_2 || null, b.phone_2_label || 'Office',
    b.phone_3 || null, b.phone_3_label || 'Home', b.fax || null,
    b.email_primary || null, b.email_secondary || null, b.website || null,
    b.referral_source || null, b.referred_by_contact_id || null,
    b.naic_code || null, b.line_of_business || null, b.department || null, b.notes || null,
    req.user.id
  );

  const id = r.lastInsertRowid;
  if (b.assignments) applyAssignments(id, b.assignments);
  if (b.tags) applyTags(id, b.tags);

  db.prepare(
    `INSERT INTO contact_activity_log (contact_id, user_id, activity_type, title) VALUES (?, ?, 'note', 'Contact created')`
  ).run(id, req.user.id);

  res.status(201).json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
});

// PUT /api/contacts/:id
router.put('/:id', (req, res) => {
  const prev = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });

  const b = req.body;

  if (b.client_code && b.client_code !== prev.client_code) {
    const dup = db.prepare('SELECT id FROM contacts WHERE client_code = ? AND id != ?').get(b.client_code, req.params.id);
    if (dup) return res.status(400).json({ error: 'Client code already in use' });
  }

  const type = b.type !== undefined ? b.type : prev.type;
  const mergedBody = { ...prev, ...b, type };
  const display_name = buildDisplayName(type, mergedBody);

  const val = (field, fallback) => b[field] !== undefined ? (b[field] || fallback) : prev[field];
  const nullable = field => b[field] !== undefined ? (b[field] || null) : prev[field];

  db.prepare(`
    UPDATE contacts SET
      type=?, status=?, display_name=?,
      first_name=?, last_name=?, ssn=?, spouse_first_name=?, spouse_last_name=?, spouse_ssn=?, date_of_birth=?,
      business_name=?, entity_type=?, federal_ein=?, fye_month=?, client_code=?, client_type=?,
      address_1=?, address_2=?, address_3=?, city=?, state=?, zip=?, country=?,
      mailing_address_1=?, mailing_address_2=?, mailing_city=?, mailing_state=?, mailing_zip=?, mailing_country=?,
      phone_1=?, phone_1_label=?, phone_2=?, phone_2_label=?, phone_3=?, phone_3_label=?, fax=?,
      email_primary=?, email_secondary=?, website=?,
      referral_source=?, referred_by_contact_id=?, naic_code=?, line_of_business=?, department=?, notes=?,
      client_group_id=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(
    type, val('status', prev.status), display_name,
    nullable('first_name'), nullable('last_name'), nullable('ssn'),
    nullable('spouse_first_name'), nullable('spouse_last_name'), nullable('spouse_ssn'), nullable('date_of_birth'),
    nullable('business_name'), nullable('entity_type'), nullable('federal_ein'),
    nullable('fye_month'), nullable('client_code'), nullable('client_type'),
    nullable('address_1'), nullable('address_2'), nullable('address_3'),
    nullable('city'), nullable('state'), nullable('zip'), val('country', 'USA'),
    nullable('mailing_address_1'), nullable('mailing_address_2'),
    nullable('mailing_city'), nullable('mailing_state'), nullable('mailing_zip'), nullable('mailing_country'),
    nullable('phone_1'), val('phone_1_label', 'Mobile'),
    nullable('phone_2'), val('phone_2_label', 'Office'),
    nullable('phone_3'), val('phone_3_label', 'Home'), nullable('fax'),
    nullable('email_primary'), nullable('email_secondary'), nullable('website'),
    nullable('referral_source'), nullable('referred_by_contact_id'),
    nullable('naic_code'), nullable('line_of_business'), nullable('department'), nullable('notes'),
    b.client_group_id !== undefined ? (b.client_group_id || null) : prev.client_group_id,
    req.params.id
  );

  if (b.status && b.status !== prev.status) {
    db.prepare(
      `INSERT INTO contact_activity_log (contact_id, user_id, activity_type, title) VALUES (?, ?, 'status_change', ?)`
    ).run(req.params.id, req.user.id, `Status changed: "${prev.status}" → "${b.status}"`);
  }

  if (b.assignments !== undefined) applyAssignments(req.params.id, b.assignments);
  if (b.tags !== undefined) applyTags(req.params.id, b.tags);

  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id));
});

// DELETE /api/contacts/:id — soft delete, admin only
router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const r = db.prepare(
    `UPDATE contacts SET status='former', updated_at=datetime('now') WHERE id=?`
  ).run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    `INSERT INTO contact_activity_log (contact_id, user_id, activity_type, title) VALUES (?, ?, 'status_change', 'Contact marked as Former')`
  ).run(req.params.id, req.user.id);
  res.status(204).send();
});

// POST /api/contacts/:id/activity
router.post('/:id/activity', (req, res) => {
  const { activity_type, title, body } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const r = db.prepare(
    `INSERT INTO contact_activity_log (contact_id, user_id, activity_type, title, body) VALUES (?, ?, ?, ?, ?)`
  ).run(req.params.id, req.user.id, activity_type || 'note', title, body || null);

  const entry = db.prepare(`
    SELECT cal.*, u.full_name AS logged_by
    FROM contact_activity_log cal
    LEFT JOIN users u ON u.id = cal.user_id
    WHERE cal.id = ?
  `).get(r.lastInsertRowid);

  res.status(201).json(entry);
});

// POST /api/contacts/:id/affiliates
router.post('/:id/affiliates', (req, res) => {
  const { affiliated_contact_id, relationship_label } = req.body;
  if (!affiliated_contact_id) return res.status(400).json({ error: 'affiliated_contact_id required' });

  const r = db.prepare(
    `INSERT INTO contact_affiliates (contact_id, affiliated_contact_id, relationship_label) VALUES (?, ?, ?)`
  ).run(req.params.id, affiliated_contact_id, relationship_label || null);

  const aff = db.prepare(`
    SELECT ca.id, ca.relationship_label, ca.affiliated_contact_id,
      c.display_name, c.type, c.status, c.client_code, c.email_primary
    FROM contact_affiliates ca
    JOIN contacts c ON c.id = ca.affiliated_contact_id
    WHERE ca.id = ?
  `).get(r.lastInsertRowid);

  res.status(201).json(aff);
});

// DELETE /api/contacts/:id/affiliates/:relId
router.delete('/:id/affiliates/:relId', (req, res) => {
  const r = db.prepare(
    'DELETE FROM contact_affiliates WHERE id = ? AND contact_id = ?'
  ).run(req.params.relId, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// POST /api/contacts/:id/tags
router.post('/:id/tags', (req, res) => {
  const { tag } = req.body;
  if (!tag) return res.status(400).json({ error: 'tag required' });
  db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag) VALUES (?, ?)').run(req.params.id, tag);
  const tags = db.prepare('SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag ASC').all(req.params.id).map(r => r.tag);
  res.json({ tags });
});

// DELETE /api/contacts/:id/tags/:tag
router.delete('/:id/tags/:tag', (req, res) => {
  db.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag = ?').run(req.params.id, decodeURIComponent(req.params.tag));
  const tags = db.prepare('SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag ASC').all(req.params.id).map(r => r.tag);
  res.json({ tags });
});

// PUT /api/contacts/:id/staff-assignments
router.put('/:id/staff-assignments', (req, res) => {
  const { assignments } = req.body;
  applyAssignments(req.params.id, assignments || []);
  const result = db.prepare(`
    SELECT csa.id, csa.role, csa.user_id, u.full_name
    FROM contact_staff_assignments csa
    JOIN users u ON u.id = csa.user_id
    WHERE csa.contact_id = ?
    ORDER BY csa.role ASC
  `).all(req.params.id);
  res.json({ assignments: result });
});

module.exports = router;
