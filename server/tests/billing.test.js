/**
 * Billing integrity — financial correctness of auto-billing, the double-bill
 * guard, manual-billing stamping, and AR / paid exclusion math.
 */
const request = require('supertest');
const {
  app, db, createUser, tokenFor, createEngagement, createEntry, createPayPeriod,
  getEntry, billingRecordsFor, allBillingRecords,
} = require('./helpers');

let admin, tAdmin, staff, tStaff;
let periodId;

beforeAll(() => {
  admin = createUser({ username: 'badm', full_name: 'Bill Admin', role: 'admin' });
  staff = createUser({ username: 'bstf', full_name: 'Bill Staff', role: 'staff' });
  tAdmin = tokenFor(admin);
  tStaff = tokenFor(staff);
  periodId = createPayPeriod({ period_number: 2, start_date: '2026-05-11', end_date: '2026-05-24' });
});

const asAdmin = (req) => req.set('Authorization', `Bearer ${tAdmin}`);

describe('auto-billing on period release', () => {
  let eng1, eng2, e1a, e1b, e1n, e2a;

  beforeAll(() => {
    eng1 = createEngagement({ client_name: 'Apex Co' });
    eng2 = createEngagement({ client_name: 'Beta LLC' });
    // eng1: 2h @ $100 + 3h @ $200 billable = $800, plus a non-billable 5h
    e1a = createEntry({ engagement_id: eng1, user: staff, date: '2026-05-12', hours: 2, rate: 100, pay_period_id: periodId });
    e1b = createEntry({ engagement_id: eng1, user: staff, date: '2026-05-13', hours: 3, rate: 200, pay_period_id: periodId });
    e1n = createEntry({ engagement_id: eng1, user: staff, date: '2026-05-14', hours: 5, rate: 999, billable: 0, pay_period_id: periodId });
    // eng2: 1.5h @ $150 = $225
    e2a = createEntry({ engagement_id: eng2, user: staff, date: '2026-05-12', hours: 1.5, rate: 150, pay_period_id: periodId });
  });

  test('creates exactly ONE record per engagement with exact sums', async () => {
    const r = await asAdmin(request(app).post(`/api/pay-periods/${periodId}/release`)).send({});
    expect(r.status).toBe(200);

    const rec1 = billingRecordsFor(eng1);
    const rec2 = billingRecordsFor(eng2);
    expect(rec1).toHaveLength(1);
    expect(rec2).toHaveLength(1);
    expect(rec1[0].invoice_amount).toBe(800);   // 2*100 + 3*200; non-billable excluded
    expect(rec2[0].invoice_amount).toBe(225);   // 1.5*150
    expect(rec1[0].status).toBe('Unbilled');

    // response reports the same
    const created = r.body.autoBilling.created;
    expect(created).toHaveLength(2);
    expect(r.body.autoBilling.totalAmount).toBe(1025);

    // billable entries stamped; non-billable NOT stamped
    expect(getEntry(e1a).billing_record_id).toBe(rec1[0].id);
    expect(getEntry(e1b).billing_record_id).toBe(rec1[0].id);
    expect(getEntry(e1n).billing_record_id).toBeNull();
    expect(getEntry(e2a).billing_record_id).toBe(rec2[0].id);
  });

  test('DOUBLE-BILL GUARD: re-releasing the same period creates NO new records', async () => {
    const before = allBillingRecords().length;
    const r = await asAdmin(request(app).post(`/api/pay-periods/${periodId}/release`)).send({});
    expect(r.status).toBe(200);
    expect(r.body.autoBilling.created).toHaveLength(0);
    expect(allBillingRecords().length).toBe(before);
    expect(billingRecordsFor(eng1)).toHaveLength(1);
    expect(billingRecordsFor(eng2)).toHaveLength(1);
  });

  test('DOUBLE-BILL GUARD: entry-level re-release of stamped entry is skipped', async () => {
    const before = allBillingRecords().length;
    const r = await asAdmin(request(app).patch(`/api/time-entries/${e1a}/status`)).send({ status: 'released' });
    expect(r.status).toBe(200);
    expect(r.body.autoBilling.created).toHaveLength(0);
    expect(allBillingRecords().length).toBe(before);
  });
});

describe('entry-level release auto-billing', () => {
  test('releasing one entry creates one record with exact amount', async () => {
    const eng = createEngagement({ client_name: 'Gamma Inc' });
    const id  = createEntry({ engagement_id: eng, user: staff, date: '2026-05-15', hours: 4, rate: 175, pay_period_id: periodId });
    const r = await asAdmin(request(app).patch(`/api/time-entries/${id}/status`)).send({ status: 'released' });
    expect(r.status).toBe(200);
    const recs = billingRecordsFor(eng);
    expect(recs).toHaveLength(1);
    expect(recs[0].invoice_amount).toBe(700); // 4 * 175
    expect(getEntry(id).billing_record_id).toBe(recs[0].id);
  });
});

describe('date-range admin release', () => {
  test('releases only the target user+range and auto-bills it once', async () => {
    const eng = createEngagement({ client_name: 'Delta Trust' });
    const inRange  = createEntry({ engagement_id: eng, user: staff, date: '2026-05-18', hours: 2, rate: 300, pay_period_id: periodId });
    const outRange = createEntry({ engagement_id: eng, user: staff, date: '2026-04-01', hours: 9, rate: 300 });

    const r = await asAdmin(request(app).post(`/api/pay-periods/0/release-user/${staff.id}`))
      .send({ startDate: '2026-05-18', endDate: '2026-05-18' });
    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(1);

    expect(getEntry(inRange).entry_status).toBe('released');
    expect(getEntry(outRange).entry_status).toBe('draft');

    const recs = billingRecordsFor(eng);
    expect(recs).toHaveLength(1);
    expect(recs[0].invoice_amount).toBe(600); // 2 * 300 — outRange not swept

    // repeat → no duplicates
    const again = await asAdmin(request(app).post(`/api/pay-periods/0/release-user/${staff.id}`))
      .send({ startDate: '2026-05-18', endDate: '2026-05-18' });
    expect(again.body.autoBilling.created).toHaveLength(0);
    expect(billingRecordsFor(eng)).toHaveLength(1);
  });
});

describe('manual billing stamps entries (no manual→auto double-bill)', () => {
  test('manual record claims unbilled entries; later release sweeps nothing', async () => {
    const eng = createEngagement({ client_name: 'Epsilon Partners' });
    const a = createEntry({ engagement_id: eng, user: staff, date: '2026-05-19', hours: 1, rate: 500, pay_period_id: periodId });
    const b = createEntry({ engagement_id: eng, user: staff, date: '2026-05-20', hours: 2, rate: 500, pay_period_id: periodId });

    const manual = await asAdmin(request(app).post('/api/billing'))
      .send({ engagement_id: eng, invoice_amount: 1200, status: 'Unbilled', invoice_date: '2026-05-20' });
    expect(manual.status).toBe(201);

    expect(getEntry(a).billing_record_id).toBe(manual.body.id);
    expect(getEntry(b).billing_record_id).toBe(manual.body.id);

    // Release the period — these entries must NOT be swept into a second record
    const rel = await asAdmin(request(app).post(`/api/pay-periods/${periodId}/release`))
      .send({ staff_member: 'Bill Staff' });
    expect(rel.status).toBe(200);
    expect(billingRecordsFor(eng)).toHaveLength(1); // still just the manual record
  });
});

describe('non-billable-only and mixed engagements', () => {
  test('engagement with only non-billable entries produces NO billing record', async () => {
    const eng = createEngagement({ client_name: 'Zeta Nonprofit' });
    const id  = createEntry({ engagement_id: eng, user: staff, date: '2026-05-21', hours: 6, rate: 100, billable: 0, pay_period_id: periodId });
    const r = await asAdmin(request(app).patch(`/api/time-entries/${id}/status`)).send({ status: 'released' });
    expect(r.status).toBe(200);
    expect(r.body.autoBilling.created).toHaveLength(0);
    expect(billingRecordsFor(eng)).toHaveLength(0);
  });

  test('mixed engagement bills only the billable portion', async () => {
    const eng  = createEngagement({ client_name: 'Eta Mixed' });
    const bill = createEntry({ engagement_id: eng, user: staff, date: '2026-05-22', hours: 2, rate: 250, pay_period_id: periodId });
    const non  = createEntry({ engagement_id: eng, user: staff, date: '2026-05-22', hours: 8, rate: 250, billable: 0, pay_period_id: periodId });

    await asAdmin(request(app).post(`/api/pay-periods/0/release-user/${staff.id}`))
      .send({ startDate: '2026-05-22', endDate: '2026-05-22' });

    const recs = billingRecordsFor(eng);
    expect(recs).toHaveLength(1);
    expect(recs[0].invoice_amount).toBe(500); // 2*250 only
    expect(getEntry(non).billing_record_id).toBeNull();
    expect(getEntry(non).entry_status).toBe('released'); // released but never billed
    expect(getEntry(bill).billing_record_id).toBe(recs[0].id);
  });
});

describe('AR ledger: paid exclusion + aging buckets', () => {
  let eng, currentRec, oldRec, paidRec;

  beforeAll(() => {
    eng = createEngagement({ client_name: 'Theta Aging' });
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
    const ins = db.prepare(
      'INSERT INTO billing_records (engagement_id, invoice_amount, status, invoice_date) VALUES (?, ?, ?, ?)'
    );
    currentRec = Number(ins.run(eng, 100, 'Invoiced', daysAgo(5)).lastInsertRowid);   // current bucket
    oldRec     = Number(ins.run(eng, 200, 'Invoiced', daysAgo(45)).lastInsertRowid);  // 31-60 bucket
    paidRec    = Number(ins.run(eng, 400, 'Paid',     daysAgo(10)).lastInsertRowid);  // excluded
  });

  test('aging buckets count only unpaid; paid is excluded', async () => {
    const r = await asAdmin(request(app).get('/api/payments/aging'));
    expect(r.status).toBe(200);
    const mine = r.body.records.filter(rec => rec.client_name === 'Theta Aging');
    expect(mine.map(m => m.id).sort()).toEqual([currentRec, oldRec].sort());
    expect(mine.find(m => m.id === paidRec)).toBeUndefined();
    expect(mine.find(m => m.id === currentRec).bucket).toBe('current');
    expect(mine.find(m => m.id === oldRec).bucket).toBe('31-60');
  });

  test('paid record stays in the billing ledger and in paid_total', async () => {
    const list = await asAdmin(request(app).get('/api/billing').query({ engagement_id: eng }));
    expect(list.body.find(rec => rec.id === paidRec)).toBeDefined(); // still in ledger

    const sum = await asAdmin(request(app).get('/api/billing/summary'));
    expect(sum.status).toBe(200);
    expect(sum.body.paid_total).toBeGreaterThanOrEqual(400);
  });

  test('marking a record Paid removes it from outstanding aging', async () => {
    await asAdmin(request(app).put(`/api/billing/${oldRec}`))
      .send({ engagement_id: eng, invoice_amount: 200, status: 'Paid', invoice_date: null, notes: null });
    const r = await asAdmin(request(app).get('/api/payments/aging'));
    expect(r.body.records.find(rec => rec.id === oldRec)).toBeUndefined();
  });
});
