/**
 * Data integrity — transaction atomicity and SQL-injection-as-data.
 */
const request = require('supertest');
const {
  app, db, createUser, tokenFor, createEngagement, createEntry, createPayPeriod,
  getEntry, billingRecordsFor,
} = require('./helpers');
const { autoBillReleasedEntries } = require('../lib/autoBilling');

let admin, tAdmin, staff;

beforeAll(() => {
  admin = createUser({ username: 'iadm', full_name: 'Int Admin', role: 'admin' });
  staff = createUser({ username: 'istf', full_name: 'Int Staff', role: 'staff' });
  tAdmin = tokenFor(admin);
});

const asAdmin = (req) => req.set('Authorization', `Bearer ${tAdmin}`);

describe('auto-billing transaction atomicity', () => {
  test('record + stamps are all-or-nothing: a mid-transaction failure rolls back everything', () => {
    const eng  = createEngagement({ client_name: 'Atomic Co' });
    const good = createEntry({ engagement_id: eng, user: staff, date: '2026-05-12', hours: 1, rate: 100, entry_status: 'released' });
    const bad  = createEntry({ engagement_id: eng, user: staff, date: '2026-05-12', hours: 2, rate: 100, entry_status: 'released' });

    // Force the SECOND stamp to fail mid-transaction
    db.exec(`
      CREATE TRIGGER test_block_stamp
      BEFORE UPDATE OF billing_record_id ON time_entries
      WHEN NEW.id = ${bad}
      BEGIN SELECT RAISE(ABORT, 'simulated mid-transaction failure'); END;
    `);

    expect(() => autoBillReleasedEntries([good, bad], '2026-05-12')).toThrow();

    db.exec('DROP TRIGGER test_block_stamp');

    // Nothing persisted: no record, no partial stamp on the first entry
    expect(billingRecordsFor(eng)).toHaveLength(0);
    expect(getEntry(good).billing_record_id).toBeNull();
    expect(getEntry(bad).billing_record_id).toBeNull();

    // And the engagement is still billable afterwards (guard not poisoned)
    const result = autoBillReleasedEntries([good, bad], '2026-05-12');
    expect(result.created).toHaveLength(1);
    expect(result.created[0].amount).toBe(300);
  });
});

describe('manual billing transaction atomicity', () => {
  test('POST /api/billing record + entry stamping is all-or-nothing', async () => {
    const eng = createEngagement({ client_name: 'Atomic Manual' });
    const e1  = createEntry({ engagement_id: eng, user: staff, date: '2026-05-13', hours: 1, rate: 100 });

    db.exec(`
      CREATE TRIGGER test_block_manual
      BEFORE UPDATE OF billing_record_id ON time_entries
      WHEN NEW.id = ${e1}
      BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;
    `);

    const r = await asAdmin(request(app).post('/api/billing'))
      .send({ engagement_id: eng, invoice_amount: 100, status: 'Unbilled' });
    // Express default error handler → 500; the important part is the rollback below
    expect(r.status).toBeGreaterThanOrEqual(500);

    db.exec('DROP TRIGGER test_block_manual');

    expect(billingRecordsFor(eng)).toHaveLength(0);          // record rolled back
    expect(getEntry(e1).billing_record_id).toBeNull();       // stamp rolled back
  });
});

describe('billing record delete unlinks entries (no permanently-blocked hours)', () => {
  test('deleting a record resets billing_record_id so hours can be re-billed', async () => {
    const eng = createEngagement({ client_name: 'Unlink Co' });
    const id  = createEntry({ engagement_id: eng, user: staff, date: '2026-05-14', hours: 2, rate: 100, entry_status: 'released' });

    const { created } = autoBillReleasedEntries([id], '2026-05-14');
    expect(created).toHaveLength(1);
    expect(getEntry(id).billing_record_id).toBe(created[0].billing_record_id);

    const r = await asAdmin(request(app).delete(`/api/billing/${created[0].billing_record_id}`));
    expect(r.status).toBe(204);
    expect(getEntry(id).billing_record_id).toBeNull(); // re-billable

    const again = autoBillReleasedEntries([id], '2026-05-15');
    expect(again.created).toHaveLength(1); // hours not permanently blocked
  });
});

describe('SQL injection treated as data', () => {
  const INJ = "'; DROP TABLE time_entries;--";

  test('time-entries filter params', async () => {
    const r = await asAdmin(request(app).get('/api/time-entries')
      .query({ service_code: INJ, staff_member: INJ, entry_status: INJ }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    // table survived
    expect(() => db.prepare('SELECT COUNT(*) FROM time_entries').get()).not.toThrow();
  });

  test('reports client search param', async () => {
    const r = await asAdmin(request(app).get('/api/reports')
      .query({ type: 'time_by_client', client: INJ }));
    expect(r.status).toBe(200);
    expect(() => db.prepare('SELECT COUNT(*) FROM engagements').get()).not.toThrow();
  });

  test('reports ar_aging client filter (JS-side filter)', async () => {
    const r = await asAdmin(request(app).get('/api/reports')
      .query({ type: 'ar_aging', client: INJ }));
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
  });

  test('login username injection → 401, users table intact', async () => {
    const r = await request(app).post('/api/auth/login')
      .send({ username: "' OR 1=1 --", password: 'whatever123' });
    expect(r.status).toBe(401);
    expect(() => db.prepare('SELECT COUNT(*) FROM users').get()).not.toThrow();
  });

  test('injected string stored as literal data, not executed', async () => {
    const eng = createEngagement({ client_name: 'Inj Co' });
    const r = await asAdmin(request(app).post('/api/time-entries'))
      .send({ engagement_id: eng, date: '2026-05-16', hours: 1, billing_rate: 100, billable: true, notes: INJ });
    expect(r.status).toBe(201);
    expect(r.body.notes).toBe(INJ); // stored verbatim
    expect(() => db.prepare('SELECT COUNT(*) FROM time_entries').get()).not.toThrow();
  });
});
