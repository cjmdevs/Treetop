/**
 * INTENDED-MATRIX CANDIDATES — endpoint-leak tests.
 *
 * These assert the authorization matrix implied by the UI (staff have no
 * Billing / AR / Reports / Staff modules; CLAUDE.md role table) against the
 * actual server. The UI hides these modules from staff, but hiding is not
 * enforcement — every test asserts the SERVER returns 403 for a staff token.
 *
 * EXPECTED OUTCOME AT TIME OF WRITING: many of these FAIL. Each failure is a
 * mechanically-proven "UI-hides-but-endpoint-leaks" finding, not a flaky test.
 * Do not "fix" a failure by deleting the test.
 */
const request = require('supertest');
const {
  app, db, createUser, tokenFor, createEngagement, createEntry,
} = require('./helpers');

let staff, tStaff, other, engId, recordId, paymentId, invoiceId;

beforeAll(() => {
  staff = createUser({ username: 'leakstf', full_name: 'Leak Staff', role: 'staff' });
  other = createUser({ username: 'leakoth', full_name: 'Other Person', role: 'manager' });
  tStaff = tokenFor(staff);

  engId = createEngagement({ client_name: 'Leak Test Client' });
  createEntry({ engagement_id: engId, user: other, date: '2026-06-01', hours: 4, rate: 250 });

  recordId = Number(db.prepare(
    "INSERT INTO billing_records (engagement_id, invoice_amount, status, invoice_date) VALUES (?, 1000, 'Unbilled', '2026-06-01')"
  ).run(engId).lastInsertRowid);
  paymentId = Number(db.prepare(
    "INSERT INTO payments (client_name, amount, payment_date) VALUES ('Leak Test Client', 500, '2026-06-01')"
  ).run().lastInsertRowid);
  invoiceId = Number(db.prepare(
    "INSERT INTO invoices (invoice_number, client_name, invoice_date, subtotal, total) VALUES ('TRT-2026-9999', 'Leak Test Client', '2026-06-01', 1000, 1000)"
  ).run().lastInsertRowid);
});

const get  = (p) => request(app).get(p).set('Authorization', `Bearer ${tStaff}`);
const post = (p) => request(app).post(p).set('Authorization', `Bearer ${tStaff}`);
const del  = (p) => request(app).delete(p).set('Authorization', `Bearer ${tStaff}`);

describe('CANDIDATE: billing endpoints should reject staff', () => {
  test('staff cannot list billing records', async () => {
    expect((await get('/api/billing')).status).toBe(403);
  });
  test('staff cannot read firm-wide billing summary', async () => {
    expect((await get('/api/billing/summary')).status).toBe(403);
  });
  test('staff cannot create billing records', async () => {
    expect((await post('/api/billing').send({ engagement_id: engId, invoice_amount: 1 })).status).toBe(403);
  });
  test('staff cannot delete billing records', async () => {
    expect((await del(`/api/billing/${recordId}`)).status).toBe(403);
  });
});

describe('CANDIDATE: invoice endpoints should reject staff', () => {
  test('staff cannot list invoices', async () => {
    expect((await get('/api/invoices')).status).toBe(403);
  });
  test('staff cannot generate invoices', async () => {
    expect((await post(`/api/invoices/generate/${recordId}`).send({})).status).toBe(403);
  });
  test('staff cannot delete invoices', async () => {
    expect((await del(`/api/invoices/${invoiceId}`)).status).toBe(403);
  });
});

describe('CANDIDATE: payments / AR endpoints should reject staff', () => {
  test('staff cannot list payments', async () => {
    expect((await get('/api/payments')).status).toBe(403);
  });
  test('staff cannot read AR aging', async () => {
    expect((await get('/api/payments/aging')).status).toBe(403);
  });
  test('staff cannot record payments', async () => {
    expect((await post('/api/payments').send({ client_name: 'X', amount: 1, payment_date: '2026-06-01' })).status).toBe(403);
  });
  test('staff cannot delete payments', async () => {
    expect((await del(`/api/payments/${paymentId}`)).status).toBe(403);
  });
});

describe('CANDIDATE: reports should reject staff (Reports is manager+ in UI)', () => {
  test('staff cannot read firm-wide staff productivity (all billable amounts)', async () => {
    expect((await get('/api/reports?type=staff_productivity')).status).toBe(403);
  });
  test('staff cannot read AR aging report', async () => {
    expect((await get('/api/reports?type=ar_aging')).status).toBe(403);
  });
  test("staff cannot read another user's detailed time via staff_detail", async () => {
    expect((await get('/api/reports?type=staff_detail&staff=Other%20Person')).status).toBe(403);
  });
});

describe("CANDIDATE: staff dashboard/detail routes leak other users' hours", () => {
  test("staff cannot read another staff member's detail (hours + billable amounts)", async () => {
    expect((await get('/api/staff/detail/Other%20Person')).status).toBe(403);
  });
  test('staff cannot read the all-staff dashboard rollup', async () => {
    expect((await get('/api/staff/dashboard')).status).toBe(403);
  });
});

describe('CANDIDATE: staff rates should be admin/manager only (Settings module)', () => {
  test('staff cannot list all staff hourly rates', async () => {
    expect((await get('/api/staff-rates')).status).toBe(403);
  });
  test('staff cannot create staff rates', async () => {
    expect((await post('/api/staff-rates').send({ staff_member: 'X', hourly_rate: 1, effective_date: '2026-01-01' })).status).toBe(403);
  });
  test('staff cannot delete staff rates', async () => {
    expect((await del('/api/staff-rates/1')).status).toBe(403);
  });
});

describe('CANDIDATE: user listing exposes hourly rates to staff', () => {
  test("GET /api/users response for staff should not include default_hourly_rate", async () => {
    const r = await get('/api/users');
    expect(r.status).toBe(200);
    expect(r.body.some(u => u.default_hourly_rate != null && u.default_hourly_rate > 0)).toBe(false);
  });
});
