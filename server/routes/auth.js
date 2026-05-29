const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const db      = require('../db/database')
const { JWT_SECRET, requireAuth } = require('../middleware/auth')

// POST /api/auth/login  — public, no auth required
router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password)
    return res.status(400).json({ error: 'username and password are required' })

  const user = db.prepare(
    'SELECT * FROM users WHERE username = ? AND active = 1'
  ).get(username)

  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' })

  const payload = {
    id:        user.id,
    username:  user.username,
    full_name: user.full_name,
    role:      user.role,
  }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token, user: payload })
})

// GET /api/auth/me  — protected
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, full_name, email, role, default_hourly_rate, active FROM users WHERE id = ?'
  ).get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

module.exports = router
