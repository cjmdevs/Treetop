const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'treetop-dev-secret-2026'

function requireAuth(req, res, next) {
  // Skip auth in test environment
  if (process.env.NODE_ENV === 'test') {
    req.user = { id: 0, username: 'test', full_name: 'Test User', role: 'admin' }
    return next()
  }

  const header = req.headers['authorization']
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = header.slice(7)
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { requireAuth, JWT_SECRET }
