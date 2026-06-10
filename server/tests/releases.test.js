/**
 * Regression tests for the time-release and due-dates flows.
 *
 * 1. Release idempotency — double-releasing the same date range must not
 *    create duplicate billing records (billing_record_id IS NULL guard).
 *
 * 2. Admin-forced release writes time_releases record — GET /api/releases must
 *    include releases triggered via POST /api/pay-periods/:id/release-user/:userId.
 *
 * 3. Due-dates endpoint — GET /api/due-dates/tax-deadlines is accessible to all
 *    authenticated roles and returns an array.
 */
const request = require('supertest');
const {
  app, db, createUser, tokenFor, createEngagement, createEntry, createPayPeriod,
  billingRecordsFor,
} = require('./helpers');

let admin, tAdmin, staff, tStaff, manager, tManager;
let eng;

beforeAll(() => {
  admin   = createUser({ username: 'rel_adm', full_name: 'Rel Admin',   role: 'admin',   rate: 200 });
  staff   = createUser({ username: 'rel_stf', full_name: 'Rel Staff',   role: 'staff',   rate: 150 });
  manager = createUser({ username: 'rel_mgr', full_name: 'Rel Manager', role: 'manager', rate: 175 });
  tAdmin   = tokenFor(admin);
  tStaff   = tokenFor(staff);
  tManager = tokenFor(manager);

  eng = createEngagement({ client_name: 'Release Test Co' });
});

const asAdmin   = req => req.set('Authorization', `Bearer ${tAdmin}`);
const asStaff   = req => req.set('Authorization', `Bearer ${tStaff}`);
const asManager = req => req.set('Authorization', `Bearer ${tManager}`);

// ── 1. Release idempotency ───────────────────────────────────────────────────

describe('release idempotency', () => {
  test('releasing the same date range twice does not create duplicate billing records', async () => {
    const e1 = createEntry({
      engagement_id: eng, user: staff,
      date: '2026-03-01', hours: 2, rate: 150, billable: 1,
    });
    const e2 = createEntry({
      engagement_id: eng, user: staff,
      date: '2026-03-02', hours: 3, rate: 150, billable: 1,
    });

    // First release
    const r1 = await asStaff(
      request(app)
        .post('/api/releases')
        .send({ start_date: '2026-03-01', end_date: '2026-03-02' })
    );
    expect(r1.status).toBe(201);
    expect(r1.body.autoBilling.created).toHaveLength(1);
    expect(r1.body.autoBilling.totalAmount).toBe(750); // (2+3) * 150

    // Second release — same date range
    const r2 = await asStaff(
      request(app)
        .post('/api/releases')
        .send({ start_date: '2026-03-01', end_date: '2026-03-02' })
    );
    expect(r2.status).toBe(201);
    // No new billing records — entries already stamped
    expect(r2.body.autoBilling.created).toHaveLength(0);
    expect(r2.body.autoBilling.totalAmount).toBe(0);

    // Only one billing record was created across both calls
    expect(billingRecordsFor(eng)).toHaveLength(1);

    // Both entries still point to the same billing record
    const entry1 = db.prepare('SELECT billing_record_id FROM time_entries WHERE id = ?').get(e1);
    const entry2 = db.prepare('SELECT billing_record_id FROM time_entries WHERE id = ?').get(e2);
    expect(entry1.billing_record_id).not.toBeNull();
    expect(entry1.billing_record_id).toBe(entry2.billing_record_id);
  });
});

// ── 2. Admin-forced release writes time_releases ─────────────────────────────

describe('admin-forced release writes time_releases record', () => {
  test('POST /api/pay-periods/0/release-user/:id creates a time_releases row', async () => {
    const e3 = createEntry({
      engagement_id: eng, user: staff,
      date: '2026-04-01', hours: 4, rate: 150, billable: 1,
    });

    const before = db.prepare(
      'SELECT COUNT(*) as n FROM time_releases WHERE user_id = ?'
    ).get(staff.id).n;

    const res = await asAdmin(
      request(app)
        .post(`/api/pay-periods/0/release-user/${staff.id}`)
        .send({ startDate: '2026-04-01', endDate: '2026-04-01' })
    );
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    const after = db.prepare(
      'SELECT COUNT(*) as n FROM time_releases WHERE user_id = ?'
    ).get(staff.id).n;

    expect(after).toBe(before + 1);

    // Verify the release record has correct totals
    const releaseRow = db.prepare(`
      SELECT * FROM time_releases WHERE user_id = ? ORDER BY id DESC LIMIT 1
    `).get(staff.id);
    expect(releaseRow.total_hours).toBe(4);
    expect(releaseRow.total_amount).toBe(600); // 4 * 150
    expect(releaseRow.start_date).toBe('2026-04-01');
    expect(releaseRow.end_date).toBe('2026-04-01');
  });

  test('re-releasing with no new entries does NOT write a duplicate time_releases row', async () => {
    // All entries in 2026-04-01 already released above — nothing new to transition
    const before = db.prepare(
      'SELECT COUNT(*) as n FROM time_releases WHERE user_id = ?'
    ).get(staff.id).n;

    const res = await asAdmin(
      request(app)
        .post(`/api/pay-periods/0/release-user/${staff.id}`)
        .send({ startDate: '2026-04-01', endDate: '2026-04-01' })
    );
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0); // nothing to release

    const after = db.prepare(
      'SELECT COUNT(*) as n FROM time_releases WHERE user_id = ?'
    ).get(staff.id).n;

    // No new row inserted (toRelease.length was 0)
    expect(after).toBe(before);
  });

  test('admin release is visible in GET /api/releases as admin', async () => {
    const releaseRows = await asAdmin(request(app).get('/api/releases'));
    expect(releaseRows.status).toBe(200);
    // The admin-forced release for staff should appear in the list
    const forStaff = releaseRows.body.filter(r => r.user_id === staff.id);
    expect(forStaff.length).toBeGreaterThan(0);
  });
});

// ── 3. Due-dates endpoint ─────────────────────────────────────────────────────

describe('GET /api/due-dates/tax-deadlines', () => {
  test('returns 200 with an array for admin', async () => {
    const res = await asAdmin(request(app).get('/api/due-dates/tax-deadlines'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('returns 200 with an array for manager', async () => {
    const res = await asManager(request(app).get('/api/due-dates/tax-deadlines'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('returns 200 with an array for staff', async () => {
    const res = await asStaff(request(app).get('/api/due-dates/tax-deadlines'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('returns 401 without a token', async () => {
    const res = await request(app).get('/api/due-dates/tax-deadlines');
    expect(res.status).toBe(401);
  });
});
