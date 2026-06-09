/**
 * Test harness with REAL authentication.
 *
 * tests/setup.js sets NODE_ENV='test' before anything loads, so:
 *   - db/database.js opens an in-memory SQLite DB (never touches real data)
 *   - middleware/auth.js loads a placeholder JWT_SECRET without fataling
 *
 * requireAuth() checks NODE_ENV at REQUEST time and stubs in a fake admin when
 * it equals 'test' — which would make every authorization test meaningless.
 * So after the app module graph is loaded we flip NODE_ENV to 'integration'.
 * From then on requireAuth performs real JWT verification + the live DB role
 * lookup, while the DB remains the in-memory one created at load time.
 */
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const app  = require('../app');
const db   = require('../db/database');
const { migrate }    = require('../db/migrate');
const { JWT_SECRET } = require('../middleware/auth');

// app.js skips migrate() in test mode; run it so the in-memory schema matches production
migrate();

// Real auth from here on
process.env.NODE_ENV = 'integration';

let userSeq = 0;

function createUser({ username, full_name, role, rate = 100, active = 1, password = 'password123' } = {}) {
  userSeq += 1;
  username  = username  || `user${userSeq}`;
  full_name = full_name || `User ${userSeq}`;
  const hashed = bcrypt.hashSync(password, 4);
  const r = db.prepare(`
    INSERT INTO users (username, password, full_name, role, default_hourly_rate, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(username, hashed, full_name, role, rate, active);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
}

function tokenFor(user, overrides = {}) {
  return jwt.sign(
    { id: user.id, username: user.username, full_name: user.full_name, role: user.role, ...overrides },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function createEngagement({ client_name = 'Test Client', engagement_type = 'Tax Return' } = {}) {
  const r = db.prepare(
    'INSERT INTO engagements (client_name, engagement_type) VALUES (?, ?)'
  ).run(client_name, engagement_type);
  return Number(r.lastInsertRowid);
}

function createEntry({
  engagement_id, user, date, hours, rate = 100,
  billable = 1, entry_status = 'draft', pay_period_id = null,
}) {
  const r = db.prepare(`
    INSERT INTO time_entries
      (engagement_id, staff_member, user_id, date, hours, billing_rate, billable, entry_status, pay_period_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(engagement_id, user.full_name, user.id, date, hours, rate, billable, entry_status, pay_period_id);
  return Number(r.lastInsertRowid);
}

function createPayPeriod({ period_number = 1, year = 2026, start_date, end_date, status = 'Open' }) {
  const r = db.prepare(
    'INSERT INTO pay_periods (period_number, year, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)'
  ).run(period_number, year, start_date, end_date, status);
  return Number(r.lastInsertRowid);
}

function getEntry(id) {
  return db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
}

function billingRecordsFor(engagementId) {
  return db.prepare('SELECT * FROM billing_records WHERE engagement_id = ?').all(engagementId);
}

function allBillingRecords() {
  return db.prepare('SELECT * FROM billing_records').all();
}

module.exports = {
  app, db, JWT_SECRET,
  createUser, tokenFor,
  createEngagement, createEntry, createPayPeriod,
  getEntry, billingRecordsFor, allBillingRecords,
};
