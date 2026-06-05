const router = require('express').Router()
const db     = require('../db/database')
const { hashToken, generateToken } = require('../utils/crypto')

const VALID_ROLES = ['admin', 'manager', 'staff']

// All routes here are already behind requireAuth (registered after the middleware in app.js).
// We additionally enforce admin-only for every handler.

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required.' })
  next()
}

// ── POST /api/invite-keys ────────────────────────────────────────────────────
// Generate a new invite key.  Returns the raw key ONCE.
router.post('/', requireAdmin, (req, res) => {
  const { username, full_name, email, role } = req.body || {}

  if (!username?.trim()) return res.status(400).json({ error: 'Username is required.' })
  if (!full_name?.trim()) return res.status(400).json({ error: 'Full name is required.' })
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}.` })

  const uname = username.trim().toLowerCase()

  // Ensure username not taken by an existing user
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(uname)
  if (existingUser) return res.status(400).json({ error: 'That username is already taken by an existing account.' })

  // Ensure username not claimed by a pending invite key
  const pendingKey = db.prepare("SELECT id FROM invite_keys WHERE username = ? AND status = 'pending'").get(uname)
  if (pendingKey) return res.status(400).json({ error: 'There is already a pending invite key for that username.' })

  const rawKey  = generateToken(18) // 36 hex chars
  const keyHash = hashToken(rawKey)

  db.prepare(`
    INSERT INTO invite_keys (key_hash, username, full_name, email, role, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(keyHash, uname, full_name.trim(), email?.trim() || null, role, req.user.id)

  // Return the raw key ONCE — never stored, never returned again
  res.json({
    key: rawKey,
    username: uname,
    full_name: full_name.trim(),
    role,
    message: 'Save this key — it will not be shown again.',
  })
})

// ── GET /api/invite-keys ─────────────────────────────────────────────────────
// List all invite keys (hashes never returned).
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT
      k.id, k.username, k.full_name, k.email, k.role,
      k.status, k.created_at, k.redeemed_at,
      u.full_name AS created_by_name
    FROM invite_keys k
    LEFT JOIN users u ON u.id = k.created_by
    ORDER BY k.created_at DESC
  `).all()
  res.json(rows)
})

// ── POST /api/invite-keys/:id/revoke ─────────────────────────────────────────
// Revoke a pending invite key.
router.post('/:id/revoke', requireAdmin, (req, res) => {
  const invite = db.prepare('SELECT * FROM invite_keys WHERE id = ?').get(req.params.id)
  if (!invite)   return res.status(404).json({ error: 'Invite key not found.' })
  if (invite.status === 'redeemed') return res.status(400).json({ error: 'Cannot revoke an already-redeemed key.' })
  if (invite.status === 'revoked')  return res.status(400).json({ error: 'Key is already revoked.' })

  db.prepare("UPDATE invite_keys SET status = 'revoked' WHERE id = ?").run(invite.id)
  res.json({ ok: true })
})

module.exports = router
