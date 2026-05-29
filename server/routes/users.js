const router = require('express').Router()
const bcrypt = require('bcryptjs')
const db     = require('../db/database')

// GET /api/users
router.get('/', (req, res) => {
  const users = db.prepare(
    `SELECT id, username, full_name, email, role, default_hourly_rate,
            rate_effective_date, active, created_at
     FROM users ORDER BY full_name`
  ).all()
  res.json(users)
})

// POST /api/users
router.post('/', (req, res) => {
  const { username, password, full_name, email, role, default_hourly_rate, rate_effective_date } = req.body || {}
  if (!username || !password || !full_name || !role)
    return res.status(400).json({ error: 'username, password, full_name, and role are required' })

  try {
    const hashed = bcrypt.hashSync(password, 10)
    const result = db.prepare(
      `INSERT INTO users (username, password, full_name, email, role, default_hourly_rate, rate_effective_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(username, hashed, full_name, email || null, role, default_hourly_rate || 0, rate_effective_date || null)
    res.status(201).json({ id: result.lastInsertRowid })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' })
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/users/:id
router.put('/:id', (req, res) => {
  const { full_name, email, role, default_hourly_rate, rate_effective_date, password } = req.body || {}
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  if (password) {
    const hashed = bcrypt.hashSync(password, 10)
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.params.id)
  }
  db.prepare(
    `UPDATE users SET full_name=?, email=?, role=?, default_hourly_rate=?, rate_effective_date=? WHERE id=?`
  ).run(full_name, email || null, role, default_hourly_rate || 0, rate_effective_date || null, req.params.id)
  res.json({ ok: true })
})

// PATCH /api/users/:id/toggle  — activate / deactivate
router.patch('/:id/toggle', (req, res) => {
  const user = db.prepare('SELECT id, active FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(user.active ? 0 : 1, req.params.id)
  res.json({ active: user.active ? 0 : 1 })
})

module.exports = router
