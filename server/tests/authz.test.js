/**
 * Core authorization matrix — these assert the rules the code claims to enforce.
 * Every test here is expected to PASS; a failure is a release blocker.
 */
const request = require('supertest');
const {
  app, db, createUser, tokenFor, createEngagement, createEntry, createPayPeriod, getEntry,
} = require('./helpers');

let admin, manager, staffA, staffB;
let tAdmin, tManager, tStaffA, tStaffB;
let engId, periodId;

beforeAll(() => {
  admin   = createUser({ username: 'adm',  full_name: 'Alice Admin',   role: 'admin'   });
  manager = createUser({ username: 'mgr',  full_name: 'Mark Manager',  role: 'manager' });
  staffA  = createUser({ username: 'stfa', full_name: 'Sam StaffA',    role: 'staff'   });
  staffB  = createUser({ username: 'stfb', full_name: 'Bella StaffB',  role: 'staff'   });
  tAdmin   = tokenFor(admin);
  tManager = tokenFor(manager);
  tStaffA  = tokenFor(staffA);
  tStaffB  = tokenFor(staffB);

  engId    = createEngagement({ client_name: 'Authz Client' });
  periodId = createPayPeriod({ period_number: 1, start_date: '2026-06-01', end_date: '2026-06-14' });
});

const as = (token) => (req) => req.set('Authorization', `Bearer ${token}`);

// ── Unauthenticated access ────────────────────────────────────────────────────

describe('no token', () => {
  test('GET /api/health is public', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  test('GET /api/auth/needs-bootstrap is public', async () => {
    const r = await request(app).get('/api/auth/needs-bootstrap');
    expect(r.status).toBe(200);
  });

  test('POST /api/auth/login is reachable (401 wrong creds, not no-token)', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'nope', password: 'wrongwrong' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Invalid credentials');
  });

  test.each([
    ['/api/users'], ['/api/time-entries'], ['/api/engagements'], ['/api/billing'],
    ['/api/dashboard'], ['/api/reports?type=ar_aging'], ['/api/pay-periods'],
    ['/api/invoices'], ['/api/payments'], ['/api/invite-keys'], ['/api/firm-settings'],
  ])('GET %s without token → 401', async (path) => {
    const r = await request(app).get(path);
    expect(r.status).toBe(401);
  });

  test('garbage token → 401', async () => {
    const r = await request(app).get('/api/users').set('Authorization', 'Bearer not.a.jwt');
    expect(r.status).toBe(401);
  });
});

// ── Login round trip ─────────────────────────────────────────────────────────

describe('login', () => {
  test('valid credentials return a working token', async () => {
    const login = await request(app).post('/api/auth/login')
      .send({ username: 'stfa', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.user.role).toBe('staff');

    const me = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('stfa');
  });
});

// ── Stale / forged tokens ─────────────────────────────────────────────────────

describe('stale-role and deactivated tokens', () => {
  test('token claiming role=admin for a DB-role=staff user does NOT grant admin access', async () => {
    const forged = tokenFor(staffA, { role: 'admin' }); // valid signature, stale/forged role claim
    const r = await request(app).post('/api/users')
      .set('Authorization', `Bearer ${forged}`)
      .send({ username: 'evil', password: 'password123', full_name: 'Evil', role: 'admin' });
    expect(r.status).toBe(403);
    expect(db.prepare("SELECT id FROM users WHERE username='evil'").get()).toBeUndefined();
  });

  test('role demotion takes effect on next request without re-login', async () => {
    const demo = createUser({ username: 'demo', full_name: 'Demo Ted', role: 'admin' });
    const tok  = tokenFor(demo); // issued while admin
    db.prepare("UPDATE users SET role='staff' WHERE id=?").run(demo.id);
    const r = await request(app).get('/api/time-summary/alerts').set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(403);
  });

  test('deactivated user token → 401', async () => {
    const gone = createUser({ username: 'gone', full_name: 'Gone Gal', role: 'staff', active: 0 });
    const r = await request(app).get('/api/engagements').set('Authorization', `Bearer ${tokenFor(gone)}`);
    expect(r.status).toBe(401);
  });

  test('token for nonexistent user id → 401', async () => {
    const r = await request(app).get('/api/engagements')
      .set('Authorization', `Bearer ${tokenFor({ id: 999999, username: 'x', full_name: 'X', role: 'admin' })}`);
    expect(r.status).toBe(401);
  });
});

// ── User management (admin only) ─────────────────────────────────────────────

describe('user management', () => {
  test.each([
    ['staff', () => tStaffA], ['manager', () => tManager],
  ])('%s cannot create users', async (_role, tok) => {
    const r = await as(tok())(request(app).post('/api/users'))
      .send({ username: 'newu', password: 'password123', full_name: 'New U', role: 'staff' });
    expect(r.status).toBe(403);
  });

  test.each([
    ['staff', () => tStaffA], ['manager', () => tManager],
  ])('%s cannot edit or toggle users', async (_role, tok) => {
    const put = await as(tok())(request(app).put(`/api/users/${admin.id}`))
      .send({ full_name: 'Hacked', role: 'staff' });
    expect(put.status).toBe(403);
    const toggle = await as(tok())(request(app).patch(`/api/users/${admin.id}/toggle`));
    expect(toggle.status).toBe(403);
  });

  test('staff cannot self-escalate by creating an admin account', async () => {
    const r = await as(tStaffA)(request(app).post('/api/users'))
      .send({ username: 'esc', password: 'password123', full_name: 'Esc', role: 'admin' });
    expect(r.status).toBe(403);
  });

  test('admin CAN create users', async () => {
    const r = await as(tAdmin)(request(app).post('/api/users'))
      .send({ username: 'okuser', password: 'password123', full_name: 'Ok User', role: 'staff' });
    expect(r.status).toBe(201);
  });
});

// ── Time entries: ownership + scope ──────────────────────────────────────────

describe('time entry ownership', () => {
  let aEntry, bEntry;
  beforeAll(() => {
    aEntry = createEntry({ engagement_id: engId, user: staffA, date: '2026-06-02', hours: 2, rate: 100, pay_period_id: periodId });
    bEntry = createEntry({ engagement_id: engId, user: staffB, date: '2026-06-02', hours: 3, rate: 150, pay_period_id: periodId });
  });

  test('staff list is self-scoped and ?staff_member= is ignored', async () => {
    const r = await as(tStaffA)(request(app).get('/api/time-entries').query({ staff_member: 'Bella StaffB' }));
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every(e => e.staff_member === 'Sam StaffA')).toBe(true);
  });

  test('manager list is also self-scoped (no cross-user reads)', async () => {
    const mEntry = createEntry({ engagement_id: engId, user: manager, date: '2026-06-03', hours: 1, pay_period_id: periodId });
    const r = await as(tManager)(request(app).get('/api/time-entries').query({ staff_member: 'Sam StaffA' }));
    expect(r.status).toBe(200);
    expect(r.body.every(e => e.staff_member === 'Mark Manager')).toBe(true);
    db.prepare('DELETE FROM time_entries WHERE id=?').run(mEntry);
  });

  test('admin can filter across users', async () => {
    const r = await as(tAdmin)(request(app).get('/api/time-entries').query({ staff_member: 'Bella StaffB' }));
    expect(r.status).toBe(200);
    expect(r.body.every(e => e.staff_member === 'Bella StaffB')).toBe(true);
  });

  test('POST ignores body.staff_member spoofing', async () => {
    const r = await as(tStaffA)(request(app).post('/api/time-entries'))
      .send({ engagement_id: engId, date: '2026-06-04', hours: 1, billing_rate: 100, billable: true, staff_member: 'Alice Admin' });
    expect(r.status).toBe(201);
    expect(r.body.staff_member).toBe('Sam StaffA');
    expect(r.body.user_id).toBe(staffA.id);
  });

  test("staff cannot edit another user's entry", async () => {
    const r = await as(tStaffA)(request(app).put(`/api/time-entries/${bEntry}`))
      .send({ engagement_id: engId, date: '2026-06-02', hours: 99 });
    expect(r.status).toBe(403);
    expect(getEntry(bEntry).hours).toBe(3);
  });

  test("staff cannot delete another user's entry", async () => {
    const r = await as(tStaffA)(request(app).delete(`/api/time-entries/${bEntry}`));
    expect(r.status).toBe(403);
    expect(getEntry(bEntry)).toBeDefined();
  });

  test("staff cannot bulk-modify another user's entries", async () => {
    const r = await as(tStaffA)(request(app).patch('/api/time-entries/bulk'))
      .send({ ids: [bEntry], billable: false });
    expect(r.status).toBe(403);
    expect(getEntry(bEntry).billable).toBe(1);
  });

  test('staff cannot release their own entry (status route)', async () => {
    const r = await as(tStaffA)(request(app).patch(`/api/time-entries/${aEntry}/status`))
      .send({ status: 'released' });
    expect(r.status).toBe(403);
    expect(getEntry(aEntry).entry_status).toBe('draft');
  });

  test('staff cannot release via PUT entry_status escalation', async () => {
    const r = await as(tStaffA)(request(app).put(`/api/time-entries/${aEntry}`))
      .send({ engagement_id: engId, date: '2026-06-02', hours: 2, entry_status: 'released' });
    expect(r.status).toBe(403);
    expect(getEntry(aEntry).entry_status).toBe('draft');
  });

  test("staff cannot submit another user's entry via status route", async () => {
    const r = await as(tStaffA)(request(app).patch(`/api/time-entries/${bEntry}/status`))
      .send({ status: 'submitted' });
    expect(r.status).toBe(403);
  });

  test('staff CAN submit their own entry', async () => {
    const r = await as(tStaffA)(request(app).patch(`/api/time-entries/${aEntry}/status`))
      .send({ status: 'submitted' });
    expect(r.status).toBe(200);
    expect(getEntry(aEntry).entry_status).toBe('submitted');
  });

  test("manager CAN release another user's entry", async () => {
    const r = await as(tManager)(request(app).patch(`/api/time-entries/${bEntry}/status`))
      .send({ status: 'released' });
    expect(r.status).toBe(200);
    expect(getEntry(bEntry).entry_status).toBe('released');
  });
});

// ── Time summaries ───────────────────────────────────────────────────────────

describe('time summaries', () => {
  test('staff/manager blocked from period grid; admin allowed', async () => {
    expect((await as(tStaffA)(request(app).get(`/api/time-summary/period/${periodId}`))).status).toBe(403);
    expect((await as(tManager)(request(app).get(`/api/time-summary/period/${periodId}`))).status).toBe(403);
    expect((await as(tAdmin)(request(app).get(`/api/time-summary/period/${periodId}`))).status).toBe(200);
  });

  test('staff/manager blocked from alerts; admin allowed', async () => {
    expect((await as(tStaffA)(request(app).get('/api/time-summary/alerts'))).status).toBe(403);
    expect((await as(tManager)(request(app).get('/api/time-summary/alerts'))).status).toBe(403);
    expect((await as(tAdmin)(request(app).get('/api/time-summary/alerts'))).status).toBe(200);
  });

  test('mtd ?staff= is ignored for staff (self-scope)', async () => {
    const today = new Date().toISOString().split('T')[0];
    createEntry({ engagement_id: engId, user: staffB, date: today, hours: 5, rate: 200 });
    const r = await as(tStaffA)(request(app).get('/api/time-summary/mtd').query({ staff: 'Bella StaffB' }));
    expect(r.status).toBe(200);
    expect(r.body.byStaff.every(s => s.staff_member === 'Sam StaffA')).toBe(true);
  });

  test('daily-hours ?staff= is ignored for staff (self-scope)', async () => {
    const r = await as(tStaffA)(request(app).get('/api/time-summary/daily-hours')
      .query({ staff: 'Bella StaffB', from: '2026-06-01', to: '2026-06-07' }));
    expect(r.status).toBe(200);
    expect(r.body.staff).toBe('Sam StaffA');
  });
});

// ── Pay periods ──────────────────────────────────────────────────────────────

describe('pay periods', () => {
  test('staff blocked from staff-summary and all-user-statuses; manager allowed', async () => {
    expect((await as(tStaffA)(request(app).get(`/api/pay-periods/${periodId}/staff-summary`))).status).toBe(403);
    expect((await as(tStaffA)(request(app).get(`/api/pay-periods/${periodId}/all-user-statuses`))).status).toBe(403);
    expect((await as(tManager)(request(app).get(`/api/pay-periods/${periodId}/staff-summary`))).status).toBe(200);
    expect((await as(tAdmin)(request(app).get(`/api/pay-periods/${periodId}/staff-summary`))).status).toBe(200);
  });

  test('staff cannot period-release; manager/admin can', async () => {
    expect((await as(tStaffA)(request(app).post(`/api/pay-periods/${periodId}/release`)).send({})).status).toBe(403);
    expect((await as(tManager)(request(app).post(`/api/pay-periods/${periodId}/release`)).send({ staff_member: 'Nobody Real' })).status).toBe(200);
  });

  test('release-user (incl. date-range mode) is admin-only', async () => {
    expect((await as(tStaffA)(request(app).post(`/api/pay-periods/${periodId}/release-user/${staffB.id}`)).send({})).status).toBe(403);
    expect((await as(tManager)(request(app).post(`/api/pay-periods/0/release-user/${staffB.id}`))
      .send({ startDate: '2026-06-01', endDate: '2026-06-14' })).status).toBe(403);
  });

  test('bulk-release and unrelease-user are admin-only', async () => {
    expect((await as(tManager)(request(app).post(`/api/pay-periods/${periodId}/bulk-release`)).send({})).status).toBe(403);
    expect((await as(tStaffA)(request(app).post(`/api/pay-periods/${periodId}/unrelease-user/${staffA.id}`)).send({})).status).toBe(403);
  });

  test('generate and status-patch are manager+', async () => {
    expect((await as(tStaffA)(request(app).post('/api/pay-periods/generate')).send({ year: 2031 })).status).toBe(403);
    expect((await as(tStaffA)(request(app).patch(`/api/pay-periods/${periodId}/status`)).send({ status: 'Released' })).status).toBe(403);
    expect((await as(tManager)(request(app).post('/api/pay-periods/generate')).send({ year: 2031 })).status).toBe(201);
  });

  test('submit: staff body.staff_member spoof only affects their own entries', async () => {
    const spoofTarget = createEntry({ engagement_id: engId, user: staffB, date: '2026-06-05', hours: 1, pay_period_id: periodId, entry_status: 'draft' });
    const own         = createEntry({ engagement_id: engId, user: staffA, date: '2026-06-05', hours: 1, pay_period_id: periodId, entry_status: 'draft' });
    const r = await as(tStaffA)(request(app).post(`/api/pay-periods/${periodId}/submit`))
      .send({ staff_member: 'Bella StaffB' });
    expect(r.status).toBe(200);
    expect(getEntry(spoofTarget).entry_status).toBe('draft');   // untouched
    expect(getEntry(own).entry_status).toBe('submitted');        // own submitted
  });
});

// ── Dashboard scoping ────────────────────────────────────────────────────────

describe('dashboard', () => {
  test('staff gets personal payload only — no firm financials', async () => {
    const r = await as(tStaffA)(request(app).get('/api/dashboard'));
    expect(r.status).toBe(200);
    expect(r.body.isPersonal).toBe(true);
    expect(r.body).not.toHaveProperty('unbilledAmount');
    expect(r.body).not.toHaveProperty('arBuckets');
    expect(r.body).not.toHaveProperty('staffUtilization');
  });

  test('manager gets personal payload only', async () => {
    const r = await as(tManager)(request(app).get('/api/dashboard'));
    expect(r.body.isPersonal).toBe(true);
    expect(r.body).not.toHaveProperty('arBuckets');
  });

  test('admin gets full firm overview', async () => {
    const r = await as(tAdmin)(request(app).get('/api/dashboard'));
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('unbilledAmount');
    expect(r.body).toHaveProperty('arBuckets');
  });
});

// ── Releases / invite keys / firm settings ───────────────────────────────────

describe('misc role gates', () => {
  test('staff release list is self-scoped', async () => {
    await as(tStaffB)(request(app).post('/api/releases')).send({ start_date: '2026-06-01', end_date: '2026-06-05' });
    const r = await as(tStaffA)(request(app).get('/api/releases'));
    expect(r.status).toBe(200);
    expect(r.body.every(rel => rel.user_id === staffA.id)).toBe(true);
  });

  test('release delete is admin-only', async () => {
    expect((await as(tStaffA)(request(app).delete('/api/releases/1'))).status).toBe(403);
    expect((await as(tManager)(request(app).delete('/api/releases/1'))).status).toBe(403);
  });

  test('invite keys are admin-only', async () => {
    expect((await as(tStaffA)(request(app).get('/api/invite-keys'))).status).toBe(403);
    expect((await as(tManager)(request(app).get('/api/invite-keys'))).status).toBe(403);
    expect((await as(tStaffA)(request(app).post('/api/invite-keys'))
      .send({ username: 'x', full_name: 'X', role: 'admin' })).status).toBe(403);
    expect((await as(tAdmin)(request(app).get('/api/invite-keys'))).status).toBe(200);
  });

  test('firm settings: read any role, write admin-only', async () => {
    expect((await as(tStaffA)(request(app).get('/api/firm-settings'))).status).toBe(200);
    expect((await as(tStaffA)(request(app).put('/api/firm-settings')).send({ firm_name: 'Hax' })).status).toBe(403);
    expect((await as(tManager)(request(app).put('/api/firm-settings')).send({ firm_name: 'Hax' })).status).toBe(403);
    expect((await as(tAdmin)(request(app).put('/api/firm-settings')).send({ firm_name: 'Real Firm' })).status).toBe(200);
  });
});
