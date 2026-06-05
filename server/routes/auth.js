const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const db      = require('../db/database')
const { JWT_SECRET, requireAuth } = require('../middleware/auth')
const { hashToken } = require('../utils/crypto')
const { consumeBootstrapToken } = require('../bootstrap')

// ── Shared helpers ───────────────────────────────────────────────────────────

function issueToken(user) {
  const payload = { id: user.id, username: user.username, full_name: user.full_name, role: user.role }
  return { token: jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' }), user: payload }
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  return null
}

function createUser({ username, password, full_name, email, role, default_hourly_rate = 0 }) {
  const hashed = bcrypt.hashSync(password, 10)
  const result = db.prepare(`
    INSERT INTO users (username, password, full_name, email, role, default_hourly_rate, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(username, hashed, full_name, email || null, role, default_hourly_rate)
  return db.prepare('SELECT id, username, full_name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid)
}

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password)
    return res.status(400).json({ error: 'username and password are required' })

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username)
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' })

  res.json(issueToken(user))
})

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, full_name, email, role, default_hourly_rate, active FROM users WHERE id = ?'
  ).get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

// ── GET /api/auth/needs-bootstrap ────────────────────────────────────────────
// Public — returns whether the first admin setup is still required.
router.get('/needs-bootstrap', (req, res) => {
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()
  res.json({ needsBootstrap: !adminExists })
})

// ── POST /api/auth/bootstrap ─────────────────────────────────────────────────
// Public — one-time endpoint to create the first admin account.
router.post('/bootstrap', (req, res) => {
  const { token, username, full_name, email, password } = req.body || {}

  // Gate 1: refuse if any admin already exists
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()
  if (adminExists)
    return res.status(400).json({ error: 'Bootstrap is no longer available — an admin account already exists.' })

  // Gate 2: check token validity
  const storedHash = db.prepare("SELECT value FROM app_meta WHERE key = 'bootstrap_token_hash'").get()
  const usedFlag   = db.prepare("SELECT value FROM app_meta WHERE key = 'bootstrap_used'").get()

  if (!storedHash || usedFlag?.value === 'true')
    return res.status(400).json({ error: 'Bootstrap token is invalid or has already been used.' })

  if (!token || hashToken(token) !== storedHash.value)
    return res.status(400).json({ error: 'Bootstrap token is incorrect.' })

  // Validate fields
  if (!username?.trim()) return res.status(400).json({ error: 'Username is required.' })
  if (!full_name?.trim()) return res.status(400).json({ error: 'Full name is required.' })

  const pwError = validatePassword(password)
  if (pwError) return res.status(400).json({ error: pwError })

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim())
  if (existing) return res.status(400).json({ error: 'Username is already taken.' })

  // Create the admin account
  const user = createUser({ username: username.trim(), password, full_name: full_name.trim(), email, role: 'admin' })

  // Permanently invalidate the bootstrap token
  consumeBootstrapToken()

  res.json(issueToken(user))
})

// ── POST /api/auth/redeem ─────────────────────────────────────────────────────
// Public — redeem a single-use invite key to create an account.
router.post('/redeem', (req, res) => {
  const { key, password } = req.body || {}
  if (!key) return res.status(400).json({ error: 'Invite key is required.' })

  const pwError = validatePassword(password)
  if (pwError) return res.status(400).json({ error: pwError })

  const keyHash = hashToken(key)
  const invite  = db.prepare("SELECT * FROM invite_keys WHERE key_hash = ?").get(keyHash)

  if (!invite)
    return res.status(400).json({ error: 'Invite key not found.' })
  if (invite.status === 'redeemed')
    return res.status(400).json({ error: 'This invite key has already been used.' })
  if (invite.status === 'revoked')
    return res.status(400).json({ error: 'This invite key has been revoked.' })

  // Double-check username still available (edge case: another invite redeemed same username)
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(invite.username)
  if (existing)
    return res.status(400).json({ error: 'That username is no longer available. Contact your admin.' })

  // Create the account
  const user = createUser({
    username:  invite.username,
    password,
    full_name: invite.full_name,
    email:     invite.email,
    role:      invite.role,
  })

  // Mark key as redeemed
  db.prepare(`
    UPDATE invite_keys
    SET status = 'redeemed', redeemed_at = datetime('now'), redeemed_user_id = ?
    WHERE id = ?
  `).run(user.id, invite.id)

  res.json(issueToken(user))
})

module.exports = router
