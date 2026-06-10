/**
 * Regression tests for the payments module (B4 — stable client linking).
 *
 * Confirms:
 *  1. POST /api/payments stores billing_record_id when provided (FK link)
 *  2. Omitting billing_record_id still works (backward compat, NULL stored)
 *  3. GET /api/payments returns the billing_record_id column
 *  4. Staff cannot access payments (manager+ only)
 */
const request = require('supertest');
const {
  app, db, createUser, tokenFor, createEngagement, createEntry,
} = require('./helpers');

let admin, tAdmin, manager, tManager, staff, tStaff;
let engId, billingRecordId;

beforeAll(() => {
  admin   = createUser({ username: 'pay_adm', full_name: 'Pay Admin',   role: 'admin',   rate: 200 });
  manager = createUser({ username: 'pay_mgr', full_name: 'Pay Manager', role: 'manager', rate: 175 });
  staff   = createUser({ username: 'pay_stf', full_name: 'Pay Staff',   role: 'staff',   rate: 150 });
  tAdmin   = tokenFor(admin);
  tManager = tokenFor(manager);
  tStaff   = tokenFor(staff);

  // Create engagement + time entry + billing record to link against
  engId = createEngagement({ client_name: 'Payment Link Co' });
  const entryId = createEntry({
    engagement_id: engId, user: admin,
    date: '2026-05-01', hours: 2, rate: 200, billable: 1,
  });

  const br = db.prepare(`
    INSERT INTO billing_records (engagement_id, invoice_amount, status, created_at)
    VALUES (?, ?, 'Invoiced', datetime('now'))
  `).run(engId, 400);
  billingRecordId = Number(br.lastInsertRowid);

  // Stamp the time entry so it's linked
  db.prepare('UPDATE time_entries SET billing_record_id = ? WHERE id = ?')
    .run(billingRecordId, entryId);
});

const asAdmin   = req => req.set('Authorization', `Bearer ${tAdmin}`);
const asManager = req => req.set('Authorization', `Bearer ${tManager}`);
const asStaff   = req => req.set('Authorization', `Bearer ${tStaff}`);

// ── 1. POST with billing_record_id ──────────────────────────────────────────

describe('POST /api/payments with billing_record_id', () => {
  test('stores the FK and returns it in the response', async () => {
    const res = await asAdmin(
      request(app)
        .post('/api/payments')
        .send({
          client_name:       'Payment Link Co',
          amount:            400,
          payment_date:      '2026-05-15',
          payment_method:    'Check',
          billing_record_id: billingRecordId,
        })
    );
    expect(res.status).toBe(201);
    expect(res.body.client_name).toBe('Payment Link Co');
    expect(res.body.billing_record_id).toBe(billingRecordId);

    // Also verify it was persisted to the DB
    const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(res.body.id);
    expect(row.billing_record_id).toBe(billingRecordId);
  });
});

// ── 2. POST without billing_record_id (backward compat) ─────────────────────

describe('POST /api/payments without billing_record_id', () => {
  test('stores NULL for billing_record_id (backward compatible)', async () => {
    const res = await asManager(
      request(app)
        .post('/api/payments')
        .send({
          client_name:    'Payment Link Co',
          amount:         100,
          payment_date:   '2026-05-20',
          payment_method: 'ACH',
        })
    );
    expect(res.status).toBe(201);
    expect(res.body.billing_record_id).toBeNull();

    const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(res.body.id);
    expect(row.billing_record_id).toBeNull();
  });
});

// ── 3. GET /api/payments returns billing_record_id ──────────────────────────

describe('GET /api/payments', () => {
  test('includes billing_record_id column in list response', async () => {
    const res = await asAdmin(request(app).get('/api/payments'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Every row should have the column (even if NULL)
    res.body.forEach(p => {
      expect(Object.prototype.hasOwnProperty.call(p, 'billing_record_id')).toBe(true);
    });
  });
});

// ── 4. Staff is blocked from payments ───────────────────────────────────────

describe('payments role gate', () => {
  test('staff GET /api/payments returns 403', async () => {
    const res = await asStaff(request(app).get('/api/payments'));
    expect(res.status).toBe(403);
  });

  test('staff POST /api/payments returns 403', async () => {
    const res = await asStaff(
      request(app)
        .post('/api/payments')
        .send({ client_name: 'X', amount: 1, payment_date: '2026-05-01', payment_method: 'Check' })
    );
    expect(res.status).toBe(403);
  });
});
