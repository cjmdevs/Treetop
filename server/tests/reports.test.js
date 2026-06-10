/**
 * Regression tests for reports endpoint fixes (B5 + B6).
 *
 * B5 — time_by_client now respects the ?client= filter
 *      (previously clientLike was constructed but never injected into the query)
 *
 * B6 — unreleased_time now respects ?startDate=/?endDate= date bounds
 *      (previously the query used te.date < date('now') with no params at all)
 */
const request = require('supertest');
const {
  app, db, createUser, tokenFor, createEngagement, createEntry,
} = require('./helpers');

let admin, manager, tAdmin, tManager;
let engAlpha, engBeta;

beforeAll(() => {
  admin   = createUser({ username: 'rpt_adm', full_name: 'Rpt Admin',   role: 'admin',   rate: 200 });
  manager = createUser({ username: 'rpt_mgr', full_name: 'Rpt Manager', role: 'manager', rate: 175 });
  tAdmin   = tokenFor(admin);
  tManager = tokenFor(manager);

  engAlpha = createEngagement({ client_name: 'Alpha Corp' });
  engBeta  = createEngagement({ client_name: 'Beta LLC'   });

  // Entries for B5 — both clients, same date range
  createEntry({ engagement_id: engAlpha, user: admin,   date: '2026-02-10', hours: 3, rate: 200, billable: 1 });
  createEntry({ engagement_id: engBeta,  user: admin,   date: '2026-02-11', hours: 5, rate: 200, billable: 1 });

  // Entries for B6 — one in range, one outside
  createEntry({ engagement_id: engAlpha, user: manager, date: '2026-01-05', hours: 4, rate: 175, billable: 1 });  // inside
  createEntry({ engagement_id: engAlpha, user: manager, date: '2026-03-20', hours: 6, rate: 175, billable: 1 });  // outside
});

const asAdmin   = req => req.set('Authorization', `Bearer ${tAdmin}`);
const asManager = req => req.set('Authorization', `Bearer ${tManager}`);

// ── B5: time_by_client client filter ────────────────────────────────────────

describe('time_by_client report — client filter (B5)', () => {
  test('without filter returns rows for both clients', async () => {
    const res = await asAdmin(
      request(app)
        .get('/api/reports')
        .query({ type: 'time_by_client', startDate: '2026-02-01', endDate: '2026-02-28' })
    );
    expect(res.status).toBe(200);
    const names = res.body.data.map(r => r.client_name);
    expect(names).toContain('Alpha Corp');
    expect(names).toContain('Beta LLC');
  });

  test('with client=Alpha only returns Alpha Corp rows', async () => {
    const res = await asAdmin(
      request(app)
        .get('/api/reports')
        .query({ type: 'time_by_client', startDate: '2026-02-01', endDate: '2026-02-28', client: 'Alpha' })
    );
    expect(res.status).toBe(200);
    const names = res.body.data.map(r => r.client_name);
    expect(names).toContain('Alpha Corp');
    expect(names).not.toContain('Beta LLC');
  });

  test('with client=beta (case-insensitive) only returns Beta LLC rows', async () => {
    const res = await asAdmin(
      request(app)
        .get('/api/reports')
        .query({ type: 'time_by_client', startDate: '2026-02-01', endDate: '2026-02-28', client: 'beta' })
    );
    expect(res.status).toBe(200);
    const names = res.body.data.map(r => r.client_name);
    expect(names).toContain('Beta LLC');
    expect(names).not.toContain('Alpha Corp');
  });

  test('with non-matching client returns empty data', async () => {
    const res = await asAdmin(
      request(app)
        .get('/api/reports')
        .query({ type: 'time_by_client', startDate: '2026-02-01', endDate: '2026-02-28', client: 'zzznomatch' })
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

// ── B6: unreleased_time date bounds ─────────────────────────────────────────

describe('unreleased_time report — date bounds respected (B6)', () => {
  test('narrow range (Jan) only returns manager with Jan entry', async () => {
    const res = await asAdmin(
      request(app)
        .get('/api/reports')
        .query({ type: 'unreleased_time', startDate: '2026-01-01', endDate: '2026-01-31' })
    );
    expect(res.status).toBe(200);
    const staffNames = res.body.data.map(r => r.staff_member);
    expect(staffNames).toContain('Rpt Manager');
  });

  test('range that excludes Jan entry does NOT include manager for that period', async () => {
    const res = await asAdmin(
      request(app)
        .get('/api/reports')
        .query({ type: 'unreleased_time', startDate: '2026-02-01', endDate: '2026-02-28' })
    );
    expect(res.status).toBe(200);
    // Manager has no entries in Feb — should not appear
    const staffNames = res.body.data.map(r => r.staff_member);
    expect(staffNames).not.toContain('Rpt Manager');
  });

  test('manager March entry appears only when range includes March', async () => {
    const res = await asAdmin(
      request(app)
        .get('/api/reports')
        .query({ type: 'unreleased_time', startDate: '2026-03-01', endDate: '2026-03-31' })
    );
    expect(res.status).toBe(200);
    const staffNames = res.body.data.map(r => r.staff_member);
    expect(staffNames).toContain('Rpt Manager');
  });

  test('returns 403 for staff', async () => {
    // unreleased_time is admin/payroll — staff has no Reports access at all
    const staffUser = createUser({ username: 'rpt_stf2', full_name: 'Rpt Staff2', role: 'staff', rate: 100 });
    const tStaff    = tokenFor(staffUser);
    const res = await request(app)
      .get('/api/reports')
      .query({ type: 'unreleased_time' })
      .set('Authorization', `Bearer ${tStaff}`);
    expect(res.status).toBe(403);
  });
});
