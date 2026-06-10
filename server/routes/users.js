const router = require('express').Router()
const bcrypt = require('bcryptjs')
const db     = require('../db/database')
const { hashToken, generateToken } = require('../utils/crypto')

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required.' })
  next()
}

// GET /api/users
// Non-admin callers receive the full list (needed for pickers) but without pay-rate fields.
// Admins receive the complete record including default_hourly_rate / rate_effective_date.
router.get('/', (req, res) => {
  const users = db.prepare(
    `SELECT id, username, full_name, email, role, default_hourly_rate,
            rate_effective_date, active, initials, created_at
     FROM users ORDER BY full_name`
  ).all()
  if (req.user.role !== 'admin') {
    return res.json(users.map(({ default_hourly_rate, rate_effective_date, ...rest }) => rest))
  }
  res.json(users)
})

// POST /api/users  — admin only
router.post('/', requireAdmin, (req, res) => {
  const { username, password, full_name, email, role, default_hourly_rate, rate_effective_date, initials } = req.body || {}
  if (!username || !password || !full_name || !role)
    return res.status(400).json({ error: 'username, password, full_name, and role are required' })

  const derivedInitials = initials?.trim() ||
    (full_name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

  try {
    const hashed = bcrypt.hashSync(password, 10)
    const result = db.prepare(
      `INSERT INTO users (username, password, full_name, email, role, default_hourly_rate, rate_effective_date, initials)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(username, hashed, full_name, email || null, role, default_hourly_rate || 0, rate_effective_date || null, derivedInitials || null)
    res.status(201).json({ id: result.lastInsertRowid })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' })
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/users/:id  — admin only
// NOTE: password is NOT accepted here. Use POST /api/users/:id/reset-key to issue a reset key.
router.put('/:id', requireAdmin, (req, res) => {
  const { full_name, email, role, default_hourly_rate, rate_effective_date, initials } = req.body || {}
  const user = db.prepare('SELECT id, initials FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  db.prepare(
    `UPDATE users SET full_name=?, email=?, role=?, default_hourly_rate=?, rate_effective_date=?, initials=? WHERE id=?`
  ).run(
    full_name, email || null, role, default_hourly_rate || 0, rate_effective_date || null,
    initials !== undefined ? (initials || null) : user.initials,
    req.params.id
  )
  res.json({ ok: true })
})

// PATCH /api/users/:id/toggle  — activate / deactivate — admin only
router.patch('/:id/toggle', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, active FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(user.active ? 0 : 1, req.params.id)
  res.json({ active: user.active ? 0 : 1 })
})

// POST /api/users/:id/reset-key  — admin only
// Generates a single-use hashed password-reset key for the target user.
// Returns the raw key ONCE — never stored, never returned again.
router.post('/:id/reset-key', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, username, full_name FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const rawKey  = generateToken(18)
  const keyHash = hashToken(rawKey)

  db.prepare(`
    INSERT INTO password_reset_keys (key_hash, user_id, status, created_by)
    VALUES (?, ?, 'pending', ?)
  `).run(keyHash, user.id, req.user.id)

  res.json({
    key: rawKey,
    user: { id: user.id, username: user.username, full_name: user.full_name },
    message: 'Share this key with the user — it will not be shown again.',
  })
})

// POST /api/users/:id/reset-key/revoke  — admin only
// Revokes the most-recent pending reset key for this user.
router.post('/:id/reset-key/revoke', requireAdmin, (req, res) => {
  const pending = db.prepare(
    "SELECT id FROM password_reset_keys WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1"
  ).get(req.params.id)
  if (!pending) return res.status(404).json({ error: 'No pending reset key found for this user.' })
  db.prepare("UPDATE password_reset_keys SET status = 'revoked' WHERE id = ?").run(pending.id)
  res.json({ ok: true })
})

module.exports = router
