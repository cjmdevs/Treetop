const jwt = require('jsonwebtoken')

// ── JWT secret resolution ─────────────────────────────────────────────────────
//
// Priority order:
//   1. process.env.JWT_SECRET (set via .env + setup.bat) — always wins if present
//   2. NODE_ENV === 'test'       — auth is fully skipped in test mode; placeholder ok
//   3. NODE_ENV === 'development' — dev fallback with a visible console warning
//   4. Anything else (production / undefined) without a secret → FATAL, refuse to start
//
// The old fallback 'treetop-dev-secret-2026' is considered public (burned) and is
// intentionally absent.  Set JWT_SECRET in server/.env via setup.bat for production.

let JWT_SECRET

if (process.env.JWT_SECRET) {
  // Real secret present — normal path (production + dev that ran setup.bat)
  JWT_SECRET = process.env.JWT_SECRET

} else if (process.env.NODE_ENV === 'test') {
  // Tests bypass requireAuth entirely (see below); the secret is never used.
  // Set a placeholder so the module loads cleanly without triggering a fatal error.
  JWT_SECRET = 'test-placeholder-never-used-in-auth'

} else if (process.env.NODE_ENV === 'development') {
  // Dev fallback — only reached when NODE_ENV is explicitly 'development'
  // AND no JWT_SECRET was configured (e.g. fresh clone, setup.bat not run yet).
  // This string is intentionally public — it is NOT secure for production.
  JWT_SECRET = 'treetop-dev-only-do-not-use-in-prod-2026'
  console.warn('\n  ⚠  WARNING: JWT_SECRET is not set.')
  console.warn('     Using an insecure dev-only fallback secret.')
  console.warn('     Run setup.bat (or add JWT_SECRET to server/.env) before deploying.\n')

} else {
  // No secret, not in dev/test → refuse to start.
  // This protects against accidentally running the server in production without setup.
  console.error('\n  FATAL: JWT_SECRET is not set.')
  console.error('  Run setup.bat to generate a secure secret, or add JWT_SECRET to server/.env.')
  console.error('  The server will not start without a configured secret.\n')
  process.exit(1)
}

// ── Middleware ────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  // Skip JWT verification entirely in test environment
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
