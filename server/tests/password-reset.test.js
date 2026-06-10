const request = require('supertest')
const { app, db, createUser, tokenFor } = require('./helpers')

let admin, staff, tAdmin, tStaff

beforeAll(() => {
  admin  = createUser({ username: 'pra', full_name: 'PR Admin', role: 'admin' })
  staff  = createUser({ username: 'prs', full_name: 'PR Staff', role: 'staff' })
  tAdmin = tokenFor(admin)
  tStaff = tokenFor(staff)
})

describe('POST /api/users/:id/reset-key', () => {
  test('admin can generate a reset key', async () => {
    const r = await request(app)
      .post(`/api/users/${staff.id}/reset-key`)
      .set('Authorization', `Bearer ${tAdmin}`)
    expect(r.status).toBe(200)
    expect(typeof r.body.key).toBe('string')
    expect(r.body.key.length).toBeGreaterThan(10)
    expect(r.body.user.id).toBe(staff.id)
  })

  test('non-admin cannot generate a reset key', async () => {
    const r = await request(app)
      .post(`/api/users/${admin.id}/reset-key`)
      .set('Authorization', `Bearer ${tStaff}`)
    expect(r.status).toBe(403)
  })

  test('404 for unknown user', async () => {
    const r = await request(app)
      .post('/api/users/99999/reset-key')
      .set('Authorization', `Bearer ${tAdmin}`)
    expect(r.status).toBe(404)
  })
})

describe('POST /api/auth/redeem-reset', () => {
  let rawKey

  beforeEach(async () => {
    const r = await request(app)
      .post(`/api/users/${staff.id}/reset-key`)
      .set('Authorization', `Bearer ${tAdmin}`)
    rawKey = r.body.key
  })

  test('valid key + new password updates password and allows login', async () => {
    const r = await request(app)
      .post('/api/auth/redeem-reset')
      .send({ key: rawKey, newPassword: 'newpassword99' })
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'prs', password: 'newpassword99' })
    expect(login.status).toBe(200)
    expect(login.body.token).toBeTruthy()
  })

  test('key is single-use — second redeem fails', async () => {
    await request(app).post('/api/auth/redeem-reset').send({ key: rawKey, newPassword: 'newpassword99' })
    const r2 = await request(app).post('/api/auth/redeem-reset').send({ key: rawKey, newPassword: 'anotherpass123' })
    expect(r2.status).toBe(400)
    expect(r2.body.error).toMatch(/already been used/i)
  })

  test('password shorter than 8 chars → 400', async () => {
    const r = await request(app).post('/api/auth/redeem-reset').send({ key: rawKey, newPassword: 'short' })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/8 characters/i)
  })

  test('wrong key → 400', async () => {
    const r = await request(app).post('/api/auth/redeem-reset').send({ key: 'totally-wrong-key', newPassword: 'newpassword99' })
    expect(r.status).toBe(400)
  })

  test('only updates target user, not others', async () => {
    const admin2 = createUser({ username: 'pra2', full_name: 'PR Admin2', role: 'admin' })
    const keyR = await request(app).post(`/api/users/${staff.id}/reset-key`).set('Authorization', `Bearer ${tAdmin}`)
    await request(app).post('/api/auth/redeem-reset').send({ key: keyR.body.key, newPassword: 'brandnewpass99' })

    // admin2's password should be unchanged (password123 from createUser default)
    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'pra2', password: 'password123' })
    expect(adminLogin.status).toBe(200)
  })
})

describe('POST /api/users/:id/reset-key/revoke', () => {
  test('revoked key cannot be redeemed', async () => {
    const gen = await request(app).post(`/api/users/${staff.id}/reset-key`).set('Authorization', `Bearer ${tAdmin}`)
    const key = gen.body.key

    await request(app).post(`/api/users/${staff.id}/reset-key/revoke`).set('Authorization', `Bearer ${tAdmin}`)

    const r = await request(app).post('/api/auth/redeem-reset').send({ key, newPassword: 'newpassword99' })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/revoked/i)
  })
})

describe('PUT /api/users/:id no longer accepts password field', () => {
  test('sending password in PUT does not change the password', async () => {
    // Set a known password first via reset key
    const keyR = await request(app).post(`/api/users/${staff.id}/reset-key`).set('Authorization', `Bearer ${tAdmin}`)
    await request(app).post('/api/auth/redeem-reset').send({ key: keyR.body.key, newPassword: 'knownpass123' })

    // Now PUT with a different password in the body
    const put = await request(app)
      .put(`/api/users/${staff.id}`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ full_name: 'PR Staff', email: null, role: 'staff', default_hourly_rate: 100, rate_effective_date: null, password: 'hackerpass' })
    expect(put.status).toBe(200)

    // 'hackerpass' should NOT work
    const hack = await request(app).post('/api/auth/login').send({ username: 'prs', password: 'hackerpass' })
    expect(hack.status).toBe(401)

    // 'knownpass123' should still work
    const ok = await request(app).post('/api/auth/login').send({ username: 'prs', password: 'knownpass123' })
    expect(ok.status).toBe(200)
  })
})
