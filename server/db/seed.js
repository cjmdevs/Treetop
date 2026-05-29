const db     = require('./database');
const bcrypt = require('bcryptjs');
const { initializeDatabase } = require('./schema');

initializeDatabase();

// ── Clear everything ──────────────────────────────────────────────────────────
db.pragma('foreign_keys = OFF');
db.exec(`
  DELETE FROM users;
  DELETE FROM custom_field_values;
  DELETE FROM custom_field_definitions;
  DELETE FROM invoice_line_items;
  DELETE FROM invoices;
  DELETE FROM payments;
  DELETE FROM notes;
  DELETE FROM subtasks;
  DELETE FROM template_subtasks;
  DELETE FROM workflow_templates;
  DELETE FROM service_codes;
  DELETE FROM billing_records;
  DELETE FROM time_entries;
  DELETE FROM engagements;
  DELETE FROM staff_rates;
  DELETE FROM pay_periods;
  DELETE FROM automation_rules;
  DELETE FROM tax_deadlines;
  DELETE FROM contact_activity_log;
  DELETE FROM contact_tags;
  DELETE FROM contact_staff_assignments;
  DELETE FROM contact_affiliates;
  DELETE FROM contacts;
  DELETE FROM contact_client_types;
`);
db.pragma('foreign_keys = ON');

// ── Pay Periods — 2026 (26 biweekly, first Monday = Jan 5) ───────────────────
const insertPeriod = db.prepare(`
  INSERT INTO pay_periods (period_number, year, start_date, end_date, status)
  VALUES (?, 2026, ?, ?, ?)
`);

const periodIds = {};
let pStart = new Date(Date.UTC(2026, 0, 5)); // Jan 5, 2026

for (let p = 1; p <= 26; p++) {
  const pEnd    = new Date(pStart);
  pEnd.setUTCDate(pEnd.getUTCDate() + 13);               // 14 days inclusive
  const startStr = pStart.toISOString().split('T')[0];
  const endStr   = pEnd.toISOString().split('T')[0];
  const status   = p <= 9 ? 'Released' : 'Open';
  const r        = insertPeriod.run(p, startStr, endStr, status);
  periodIds[p]   = r.lastInsertRowid;
  pStart = new Date(pEnd);
  pStart.setUTCDate(pStart.getUTCDate() + 1);
}
// P10 = May 11 – May 24, 2026 (current as of May 20, 2026)

// ── Staff Rates ───────────────────────────────────────────────────────────────
const insertRate = db.prepare(
  'INSERT INTO staff_rates (staff_member, hourly_rate, effective_date) VALUES (?, ?, ?)'
);
[
  ['Marcus Maurer', 350, '2026-01-01'],
  ['Sofia Graf',    275, '2026-01-01'],
  ['Diego Rivera',  175, '2026-01-01'],
  ['Carson',          0, '2026-01-01'],
].forEach(args => insertRate.run(...args));

// ── Users (inserted early so time entries can reference user_id) ──────────────
const insertUser = db.prepare(`
  INSERT INTO users (username, password, full_name, email, role, default_hourly_rate, rate_effective_date)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const userIds = {};
[
  ['mmaurer', 'admin123',   'Marcus Maurer', 'mmaurer@mgrcpas.com',       'admin',   350, '2026-01-01'],
  ['sgraf',   'manager123', 'Sofia Graf',    'sgraf@mgrcpas.com',         'manager', 275, '2026-01-01'],
  ['drivera', 'staff123',   'Diego Rivera',  'drivera@mgrcpas.com',       'staff',   175, '2026-01-01'],
  ['carson',  'admin123',   'Carson',        'carsonjjmaurer@gmail.com',  'admin',     0, '2026-01-01'],
].forEach(([username, password, full_name, email, role, rate, date]) => {
  const hashed = bcrypt.hashSync(password, 10);
  const r = insertUser.run(username, hashed, full_name, email, role, rate, date);
  userIds[full_name] = r.lastInsertRowid;
});

// ── Engagements ───────────────────────────────────────────────────────────────
const insertEngagement = db.prepare(`
  INSERT INTO engagements
    (client_name, engagement_type, tax_year, due_date, status, assigned_staff,
     priority, notes, budgeted_hours, budgeted_amount, recurrence_frequency)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const engagements = [
  ['Apex Industries LLC',    'Tax Return',  2024, '2026-04-15', 'In Progress', 'Marcus Maurer', 'High',   'Corporate return, complex depreciation schedules', 20, 5000,  'Annually'],
  ['Chen Family Trust',      'Tax Return',  2024, '2026-04-15', 'Not Started', 'Sofia Graf',    'Medium', 'Multiple K-1s expected',                           12, 2400,  'Annually'],
  ['Riverside Dental Group', 'Bookkeeping', null, '2026-05-31', 'In Progress', 'Diego Rivera',  'Medium', 'Monthly bookkeeping, reconcile Q1',                 8,  1200,  'Monthly'],
  ['Pacific Ventures Inc',   'Audit',       2024, '2026-06-30', 'In Review',   'Marcus Maurer', 'High',   'Year-end audit for bank covenant compliance',       40, 12000, 'Annually'],
  ['Santos & Associates',    'Advisory',    null, '2026-05-15', 'Not Started', 'Sofia Graf',    'Low',    'Business valuation consultation',                   6,  1800,  'None'],
];

const ids = engagements.map(e => insertEngagement.run(...e).lastInsertRowid);

// ── Time Entries — all in P10 (May 11–24, 2026) ───────────────────────────────
const p10 = periodIds[10]; // the ID for pay period 10

const insertTimeEntry = db.prepare(`
  INSERT INTO time_entries
    (engagement_id, staff_member, user_id, date, hours, billing_rate, notes,
     billable, service_code, pay_period_id, internal_memo, entry_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'draft')
`);

const te = (engId, name, date, hrs, rate, notes, billable, code) =>
  insertTimeEntry.run(engId, name, userIds[name], date, hrs, rate, notes, billable, code, p10);

te(ids[0], 'Marcus Maurer', '2026-05-12', 3.5, 250, 'Reviewed prior year return',   1, 'TAX-PREP');
te(ids[0], 'Marcus Maurer', '2026-05-13', 2.0, 250, 'Depreciation schedule prep',   1, 'TAX-PREP');
te(ids[0], 'Marcus Maurer', '2026-05-14', 4.5, 250, 'Tax return preparation',       1, 'TAX-PREP');
te(ids[0], 'Marcus Maurer', '2026-05-15', 8.0, 250, 'Final review and client call', 1, 'TAX-REVIEW');
te(ids[1], 'Sofia Graf',    '2026-05-14', 1.5, 200, 'Initial client call',          1, 'ADMIN-COMM');
te(ids[2], 'Diego Rivera',  '2026-05-13', 4.0, 150, 'Q1 bank reconciliation',       1, 'BOOKKEEPING');
te(ids[2], 'Diego Rivera',  '2026-05-20', 3.0, 150, 'April categorization',         1, 'BOOKKEEPING');
te(ids[3], 'Marcus Maurer', '2026-05-15', 5.0, 300, 'Audit fieldwork day 1',        1, 'AUDIT-FIELD');
te(ids[3], 'Marcus Maurer', '2026-05-16', 6.0, 300, 'Audit fieldwork day 2',        1, 'AUDIT-FIELD');

// ── Billing Records ───────────────────────────────────────────────────────────
const insertBilling = db.prepare(`
  INSERT INTO billing_records (engagement_id, invoice_amount, status, invoice_date, notes)
  VALUES (?, ?, ?, ?, ?)
`);

insertBilling.run(ids[0], 2500, 'Unbilled',  null,         'Partial billing for prep work');
insertBilling.run(ids[2],  600, 'Invoiced',  '2026-05-01', 'April bookkeeping');
insertBilling.run(ids[3], 4500, 'Paid',      '2026-04-15', 'Audit deposit');

// ── Service Codes ─────────────────────────────────────────────────────────────
const insertCode = db.prepare(`
  INSERT INTO service_codes (code, description, number, category, subcategory, default_rate, billable_default, active)
  VALUES (?, ?, ?, ?, ?, ?, 1, 1)
`);
[
  // [abbreviation, description, number, category, subcategory, default_rate]
  ['TAX-PREP',       'Tax Preparation',           '101', 'Tax',         null, 250],
  ['TAX-REVIEW',     'Tax Review',                '102', 'Tax',         null, 250],
  ['TAX-EXT',        'Tax Extension Filing',      '103', 'Tax',         null, 200],
  ['TAX-PLAN',       'Tax Planning',              '104', 'Tax',         null, 250],
  ['AUDIT-PREP',     'Audit Preparation',         '201', 'Audit',       null, 300],
  ['AUDIT-FIELD',    'Audit Fieldwork',           '202', 'Audit',       null, 300],
  ['AUDIT-REVIEW',   'Audit Review',              '203', 'Audit',       null, 250],
  ['BOOKKEEPING',    'General Bookkeeping',       '301', 'Bookkeeping', null, 150],
  ['BK-RECON',       'Bank Reconciliation',       '302', 'Bookkeeping', null, 150],
  ['BK-PAYROLL',     'Payroll Processing',        '303', 'Bookkeeping', null, 125],
  ['CONSULT',        'General Consultation',      '401', 'Advisory',    null, 250],
  ['ADV-ENTITY',     'Entity Structuring',        '402', 'Advisory',    null, 250],
  ['ADMIN',          'General Administrative',    '501', 'Admin',       null,   0],
  ['ADMIN-FILING',   'Filing & Organization',     '502', 'Admin',       null,   0],
  ['ADMIN-COMM',     'Client Communication',      '503', 'Admin',       null,   0],
  ['TRAINING',       'Staff Training',            '504', 'Admin',       null,   0],
  ['CORRESPONDENCE', 'Client Correspondence',     '601', 'Other',       null,   0],
  ['OTHER',          'Other',                     '999', 'Other',       null,   0],
].forEach(([code, desc, num, cat, sub, rate]) =>
  insertCode.run(code, desc, num, cat, sub, rate)
);

// ── Workflow Templates ────────────────────────────────────────────────────────
const insertTemplate = db.prepare(
  'INSERT INTO workflow_templates (name, engagement_type, default_priority) VALUES (?, ?, ?)'
);
const insertTemplateSub = db.prepare(
  'INSERT INTO template_subtasks (template_id, title, default_assignee_role, sort_order) VALUES (?, ?, ?, ?)'
);

const t1 = insertTemplate.run('Tax Return Standard', 'Tax Return', 'High').lastInsertRowid;
[
  ['Gather client documents',       'Staff',   0],
  ['Prior year comparison review',  'Senior',  1],
  ['Prepare tax return',            'Senior',  2],
  ['Partner review',                'Partner', 3],
  ['Client review meeting',         'Partner', 4],
  ['E-file and confirm acceptance', 'Staff',   5],
].forEach(([title, role, order]) => insertTemplateSub.run(t1, title, role, order));

const t2 = insertTemplate.run('Bookkeeping Monthly', 'Bookkeeping', 'Medium').lastInsertRowid;
[
  ['Download bank statements',      'Staff',  0],
  ['Categorize transactions',       'Staff',  1],
  ['Bank reconciliation',           'Senior', 2],
  ['Accounts receivable review',    'Senior', 3],
  ['Deliver reports to client',     'Staff',  4],
].forEach(([title, role, order]) => insertTemplateSub.run(t2, title, role, order));

const t3 = insertTemplate.run('Audit Full', 'Audit', 'High').lastInsertRowid;
[
  ['Engagement letter & planning',  'Partner', 0],
  ['Risk assessment',               'Senior',  1],
  ['Fieldwork — sampling',          'Senior',  2],
  ['Fieldwork — confirmations',     'Staff',   3],
  ['Draft audit report',            'Senior',  4],
  ['Partner review & sign-off',     'Partner', 5],
  ['Issue final report',            'Partner', 6],
].forEach(([title, role, order]) => insertTemplateSub.run(t3, title, role, order));

// ── Subtasks ──────────────────────────────────────────────────────────────────
const insertSubtask = db.prepare(`
  INSERT INTO subtasks (engagement_id, title, assigned_staff, status, sort_order)
  VALUES (?, ?, ?, ?, ?)
`);

[
  [ids[0], 'Gather client documents',       'Marcus Maurer', 'Complete',    0],
  [ids[0], 'Prior year comparison review',  'Marcus Maurer', 'Complete',    1],
  [ids[0], 'Prepare tax return',            'Marcus Maurer', 'In Progress', 2],
  [ids[0], 'Partner review',               'Marcus Maurer', 'Not Started', 3],
  [ids[0], 'Client review meeting',         'Marcus Maurer', 'Not Started', 4],
  [ids[0], 'E-file and confirm acceptance', 'Marcus Maurer', 'Not Started', 5],
  [ids[1], 'Gather client documents',       'Sofia Graf',    'Not Started', 0],
  [ids[1], 'Prior year comparison review',  'Sofia Graf',    'Not Started', 1],
  [ids[1], 'Prepare tax return',            'Sofia Graf',    'Not Started', 2],
].forEach(args => insertSubtask.run(...args));

// ── Notes ─────────────────────────────────────────────────────────────────────
const insertNote = db.prepare(`
  INSERT INTO notes (entity_type, entity_id, note_text, category, priority_flag, created_by, pinned)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insertNote.run('engagement', ids[0], 'Client confirmed they have Section 179 assets this year — expect higher deduction than prior year.', 'Tax',     1, 'Marcus Maurer', 1);
insertNote.run('engagement', ids[0], 'Spoke with CFO on 5/12 — they will send remaining depreciation schedules by EOD Monday.',            'General', 0, 'Marcus Maurer', 0);
insertNote.run('engagement', ids[3], 'Bank covenant requires audit opinion by June 30 — hard deadline, no extensions possible.',            'General', 1, 'Marcus Maurer', 1);

// ── Payment ───────────────────────────────────────────────────────────────────
db.prepare(`
  INSERT INTO payments (client_name, amount, payment_date, payment_method, reference_number, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('Pacific Ventures Inc', 4500, '2026-04-20', 'Check', 'CHK-4412', 'Payment for audit deposit invoice');

// ── Automation Rules ──────────────────────────────────────────────────────────
const insertRule = db.prepare(`
  INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, active)
  VALUES (?, ?, ?, ?, ?, 1)
`);

insertRule.run(
  'Auto-assign reviewer on In Review',
  'status_changed',
  JSON.stringify({ to_status: 'In Review' }),
  'reassign_staff',
  JSON.stringify({ staff_member: 'Marcus Maurer' })
);
insertRule.run(
  'Complete engagement when all tasks done',
  'subtask_completed',
  JSON.stringify({ all_complete: true }),
  'change_status',
  JSON.stringify({ status: 'Complete' })
);
insertRule.run(
  'Flag urgent when due soon',
  'due_date_within',
  JSON.stringify({ days: 3 }),
  'set_priority',
  JSON.stringify({ priority: 'High' })
);

// ── Tax Deadlines ─────────────────────────────────────────────────────────────
const insertDeadline = db.prepare(`
  INSERT INTO tax_deadlines (month, day, description, form_types, applies_to)
  VALUES (?, ?, ?, ?, ?)
`);
[
  [1,  15, 'Q4 Estimated Tax Payment Due',             '1040-ES',      'Individuals'],
  [3,  15, 'S-Corp & Partnership Returns Due',          '1120-S, 1065', 'S-Corps, Partnerships'],
  [4,  15, 'Individual & C-Corp Returns Due',           '1040, 1120',   'Individuals, C-Corps'],
  [4,  15, 'Q1 Estimated Tax Payment Due',              '1040-ES',      'Individuals'],
  [4,  15, 'Estate & Trust Returns Due',                '1041',         'Estates, Trusts'],
  [6,  15, 'Q2 Estimated Tax Payment Due',              '1040-ES',      'Individuals'],
  [6,  15, 'Overseas Individual Returns Due',           '1040',         'Foreign Residents'],
  [9,  15, 'Extended S-Corp & Partnership Returns Due', '1120-S, 1065', 'S-Corps, Partnerships'],
  [9,  15, 'Q3 Estimated Tax Payment Due',              '1040-ES',      'Individuals'],
  [10, 15, 'Extended Individual Returns Due',           '1040',         'Individuals'],
  [10, 15, 'Extended Estate & Trust Returns Due',       '1041',         'Estates, Trusts'],
].forEach(args => insertDeadline.run(...args));

// ── Contact Client Types ──────────────────────────────────────────────────────
const insertClientType = db.prepare(
  'INSERT OR IGNORE INTO contact_client_types (code, label, sort_order) VALUES (?, ?, ?)'
);
[
  ['1040',        '1040 – Individual',           1],
  ['1120',        '1120 – C-Corp',               2],
  ['1120S',       '1120S – S-Corp',              3],
  ['1065',        '1065 – Partnership',          4],
  ['1041',        '1041 – Estate / Trust',       5],
  ['990',         '990 – Non-Profit',            6],
  ['990-PF',      '990-PF – Private Foundation', 7],
  ['Bookkeeping', 'Bookkeeping',                 8],
  ['Payroll',     'Payroll',                     9],
  ['Advisory',    'Advisory',                   10],
  ['Other',       'Other',                      11],
].forEach(([code, label, order]) => insertClientType.run(code, label, order));

// ── Contacts ──────────────────────────────────────────────────────────────────
const insertContact = db.prepare(`
  INSERT INTO contacts (
    type, status, display_name,
    first_name, last_name, ssn, spouse_first_name, spouse_last_name, spouse_ssn, date_of_birth,
    business_name, entity_type, federal_ein, fye_month, client_code, client_type,
    address_1, city, state, zip, country,
    phone_1, phone_1_label, phone_2, phone_2_label,
    email_primary, email_secondary, website,
    referral_source, naic_code, line_of_business, notes, created_by
  ) VALUES (
    ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?
  )
`);

const cIds = {};

// 1. Apex Industries LLC
cIds['apex'] = insertContact.run(
  'business', 'active', 'Apex Industries LLC',
  null, null, null, null, null, null, null,
  'Apex Industries LLC', 'LLC', '12-3450001', 12, 'APEX001', '1120',
  '4200 Commerce Blvd', 'Sacramento', 'CA', '95814', 'USA',
  '(916) 555-0121', 'Office', '(916) 555-0122', 'Fax',
  'contact@apexindustries.com', null, 'www.apexindustries.com',
  'Referral', '332900', 'Manufacturing', 'Long-term client, complex depreciation schedules each year.', userIds['Marcus Maurer']
).lastInsertRowid;

// 2. Chen Family Trust
cIds['chen_trust'] = insertContact.run(
  'business', 'active', 'Chen Family Trust',
  null, null, null, null, null, null, null,
  'Chen Family Trust', 'Trust', '94-0000123', 12, 'CHFT001', '1041',
  '815 Willow Creek Rd', 'Palo Alto', 'CA', '94301', 'USA',
  '(650) 555-0188', 'Office', null, 'Mobile',
  'trust@chenfamily.com', null, null,
  null, null, 'Family Trust', 'Multiple K-1s expected annually.', userIds['Sofia Graf']
).lastInsertRowid;

// 3. Linda Chen (individual — trustee of Chen Family Trust)
cIds['linda_chen'] = insertContact.run(
  'individual', 'active', 'Chen, Linda',
  'Linda', 'Chen', '000-00-0001', 'Michael', 'Chen', '000-00-0002', '1968-04-12',
  null, null, null, 12, 'CHEN001', '1040',
  '815 Willow Creek Rd', 'Palo Alto', 'CA', '94301', 'USA',
  '(650) 555-0189', 'Mobile', null, 'Office',
  'linda.chen@gmail.com', 'linda@chenfamily.com', null,
  null, null, null, 'Trustee and primary contact for Chen Family Trust.', userIds['Sofia Graf']
).lastInsertRowid;

// 4. Riverside Dental Group
cIds['riverside'] = insertContact.run(
  'business', 'active', 'Riverside Dental Group',
  null, null, null, null, null, null, null,
  'Riverside Dental Group', 'LLC', '47-0000321', 12, 'RIVD001', 'Bookkeeping',
  '2201 Riverside Ave', 'Fresno', 'CA', '93721', 'USA',
  '(559) 555-0144', 'Office', '(559) 555-0145', 'Fax',
  'billing@riversidedental.com', null, 'www.riversidedental.com',
  'Yellow Pages', '621210', 'Dental Practice', 'Monthly bookkeeping, quarterly payroll review.', userIds['Marcus Maurer']
).lastInsertRowid;

// 5. Pacific Ventures Inc
cIds['pacific'] = insertContact.run(
  'business', 'active', 'Pacific Ventures Inc',
  null, null, null, null, null, null, null,
  'Pacific Ventures Inc', 'C-Corp', '91-0004567', 3, 'PACV001', '1120',
  '500 Market St Ste 1800', 'San Francisco', 'CA', '94105', 'USA',
  '(415) 555-0177', 'Office', null, 'Mobile',
  'cfo@pacificventures.com', 'admin@pacificventures.com', 'www.pacificventures.com',
  'Bank Referral', '523900', 'Investment Holding', 'Annual audit for bank covenant compliance. Hard June 30 deadline.', userIds['Marcus Maurer']
).lastInsertRowid;

// 6. Santos & Associates
cIds['santos'] = insertContact.run(
  'business', 'active', 'Santos & Associates',
  null, null, null, null, null, null, null,
  'Santos & Associates', 'LLC', '33-0009876', 12, 'SANT001', 'Advisory',
  '780 Grand Ave', 'Oakland', 'CA', '94610', 'USA',
  '(510) 555-0133', 'Office', null, 'Mobile',
  'info@santosassociates.com', null, null,
  'Referral', '541611', 'Management Consulting', 'Business valuation consultation engagement.', userIds['Sofia Graf']
).lastInsertRowid;

// 7. Diego Santos (individual — owner of Santos & Associates)
cIds['diego_santos'] = insertContact.run(
  'individual', 'active', 'Santos, Diego M.',
  'Diego', 'Santos', '000-00-0003', null, null, null, '1979-11-30',
  null, null, null, 12, 'SANT002', 'Advisory',
  '780 Grand Ave', 'Oakland', 'CA', '94610', 'USA',
  '(510) 555-0134', 'Mobile', '(510) 555-0133', 'Office',
  'diego@santosassociates.com', null, null,
  null, null, null, 'Owner and principal of Santos & Associates.', userIds['Sofia Graf']
).lastInsertRowid;

// 8. Robert & Sarah Thompson (individual, prospect)
cIds['thompson'] = insertContact.run(
  'individual', 'prospect', 'Thompson, Robert J.',
  'Robert', 'Thompson', '000-00-0004', 'Sarah', 'Thompson', '000-00-0005', '1982-07-04',
  null, null, null, 12, 'THOM001', '1040',
  '1455 Oak Hill Dr', 'Modesto', 'CA', '95354', 'USA',
  '(209) 555-0156', 'Mobile', '(209) 555-0157', 'Home',
  'rob.thompson@email.com', 'sarah.thompson@email.com', null,
  'Chamber of Commerce', null, null, 'Prospect — met at Modesto Chamber event. Referred by Pacific Ventures.', userIds['Marcus Maurer']
).lastInsertRowid;

// 9. Thompson Realty LLC (business, prospect, owned by Robert Thompson)
cIds['thompson_realty'] = insertContact.run(
  'business', 'prospect', 'Thompson Realty LLC',
  null, null, null, null, null, null, null,
  'Thompson Realty LLC', 'LLC', '26-0001234', 12, 'THOM002', '1065',
  '1455 Oak Hill Dr', 'Modesto', 'CA', '95354', 'USA',
  '(209) 555-0158', 'Office', null, 'Mobile',
  'rob.thompson@email.com', null, null,
  'Chamber of Commerce', '531210', 'Real Estate Brokerage', null, userIds['Marcus Maurer']
).lastInsertRowid;

// 10. Elena Vasquez (individual, inactive — formerly active)
cIds['vasquez'] = insertContact.run(
  'individual', 'inactive', 'Vasquez, Elena R.',
  'Elena', 'Vasquez', '000-00-0006', null, null, null, '1955-02-18',
  null, null, null, 12, 'VASQ001', '1040',
  '322 Pine St Apt 4', 'Stockton', 'CA', '95202', 'USA',
  '(209) 555-0199', 'Mobile', null, 'Office',
  'evasquez@email.com', null, null,
  null, null, null, 'Retired client. Returns may not recur.', userIds['Sofia Graf']
).lastInsertRowid;

// ── Contact Staff Assignments ─────────────────────────────────────────────────
const insertCSA = db.prepare(
  'INSERT OR IGNORE INTO contact_staff_assignments (contact_id, role, user_id) VALUES (?, ?, ?)'
);

// Apex Industries
insertCSA.run(cIds['apex'], 'Primary Partner', userIds['Marcus Maurer']);
insertCSA.run(cIds['apex'], 'Manager', userIds['Sofia Graf']);
insertCSA.run(cIds['apex'], 'Tax Preparer', userIds['Marcus Maurer']);

// Chen Family Trust
insertCSA.run(cIds['chen_trust'], 'Primary Partner', userIds['Sofia Graf']);
insertCSA.run(cIds['chen_trust'], 'Tax Preparer', userIds['Diego Rivera']);

// Linda Chen
insertCSA.run(cIds['linda_chen'], 'Primary Partner', userIds['Sofia Graf']);

// Riverside Dental
insertCSA.run(cIds['riverside'], 'Primary Partner', userIds['Marcus Maurer']);
insertCSA.run(cIds['riverside'], 'Manager', userIds['Sofia Graf']);
insertCSA.run(cIds['riverside'], 'Tax Preparer', userIds['Diego Rivera']);

// Pacific Ventures
insertCSA.run(cIds['pacific'], 'Primary Partner', userIds['Marcus Maurer']);
insertCSA.run(cIds['pacific'], 'Tax Reviewer', userIds['Marcus Maurer']);

// Santos & Associates
insertCSA.run(cIds['santos'], 'Primary Partner', userIds['Sofia Graf']);
insertCSA.run(cIds['santos'], 'Manager', userIds['Diego Rivera']);

// Diego Santos
insertCSA.run(cIds['diego_santos'], 'Primary Partner', userIds['Sofia Graf']);

// Thompson
insertCSA.run(cIds['thompson'], 'Primary Partner', userIds['Marcus Maurer']);
insertCSA.run(cIds['thompson_realty'], 'Primary Partner', userIds['Marcus Maurer']);

// Vasquez
insertCSA.run(cIds['vasquez'], 'Primary Partner', userIds['Sofia Graf']);

// ── Contact Tags ──────────────────────────────────────────────────────────────
const insertTag = db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag) VALUES (?, ?)');

['Corporate', 'Tax', 'Audit'].forEach(t => insertTag.run(cIds['apex'], t));
['Trust', 'Tax', 'High-Value'].forEach(t => insertTag.run(cIds['chen_trust'], t));
['Trust', 'Individual'].forEach(t => insertTag.run(cIds['linda_chen'], t));
['Bookkeeping', 'Monthly', 'Healthcare'].forEach(t => insertTag.run(cIds['riverside'], t));
['Audit', 'Corporate', 'High-Value'].forEach(t => insertTag.run(cIds['pacific'], t));
['Advisory', 'Consulting'].forEach(t => insertTag.run(cIds['santos'], t));
['Advisory', 'Individual'].forEach(t => insertTag.run(cIds['diego_santos'], t));
['Prospect', 'Individual'].forEach(t => insertTag.run(cIds['thompson'], t));
['Prospect', 'Real Estate'].forEach(t => insertTag.run(cIds['thompson_realty'], t));
['Individual', 'Inactive'].forEach(t => insertTag.run(cIds['vasquez'], t));

// ── Contact Affiliates ────────────────────────────────────────────────────────
const insertAff = db.prepare(
  'INSERT INTO contact_affiliates (contact_id, affiliated_contact_id, relationship_label) VALUES (?, ?, ?)'
);

// Linda Chen is Trustee of Chen Family Trust (both directions)
insertAff.run(cIds['chen_trust'], cIds['linda_chen'], 'Trustee');
insertAff.run(cIds['linda_chen'], cIds['chen_trust'], 'Trust Entity');

// Diego Santos is Owner of Santos & Associates
insertAff.run(cIds['santos'], cIds['diego_santos'], 'Owner');
insertAff.run(cIds['diego_santos'], cIds['santos'], 'Business Entity');

// Robert Thompson is Owner of Thompson Realty
insertAff.run(cIds['thompson_realty'], cIds['thompson'], 'Owner');
insertAff.run(cIds['thompson'], cIds['thompson_realty'], 'Business Entity');

// ── Contact Activity Log ──────────────────────────────────────────────────────
const insertActivity = db.prepare(`
  INSERT INTO contact_activity_log (contact_id, user_id, activity_type, title, body, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

insertActivity.run(cIds['apex'], userIds['Marcus Maurer'], 'note',
  'Annual engagement kickoff call',
  'Spoke with CFO. They confirmed Section 179 assets again this year. Will send depreciation schedules by end of week.',
  '2026-04-02 09:15:00');
insertActivity.run(cIds['apex'], userIds['Marcus Maurer'], 'meeting',
  'In-person review meeting',
  'Met at client office to review draft return. Client satisfied with estimates.',
  '2026-05-10 14:00:00');
insertActivity.run(cIds['chen_trust'], userIds['Sofia Graf'], 'call',
  'Initial call re: K-1 documents',
  'Linda confirmed K-1s from all three partnerships will arrive by March 15.',
  '2026-02-28 10:30:00');
insertActivity.run(cIds['pacific'], userIds['Marcus Maurer'], 'note',
  'Bank covenant deadline confirmed',
  'CFO emailed to confirm June 30 is a hard deadline per their loan agreement.',
  '2026-04-18 11:00:00');
insertActivity.run(cIds['thompson'], userIds['Marcus Maurer'], 'note',
  'First contact — Chamber event',
  'Met Robert and Sarah at Modesto Chamber of Commerce mixer. They are looking to switch CPA firms.',
  '2026-03-15 16:45:00');

console.log('Database seeded: 5 engagements, 9 time entries (P10/2026), 3 billing records,');
console.log('  18 service codes, 3 templates, 9 subtasks, 3 notes, 1 payment,');
console.log('  3 automation rules, 11 tax deadlines, 26 pay periods (2026), 3 staff rates, 4 users,');
console.log('  11 client types, 10 contacts with client_type, staff assignments, tags, affiliates, and activity.');
