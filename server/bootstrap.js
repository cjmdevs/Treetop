/**
 * bootstrap.js
 *
 * Handles the one-time bootstrap token for first-admin setup.
 *
 * Called on server startup (after the DB is initialized).
 * - If any admin user already exists: clears the token file and returns.
 * - If no admin exists and a valid unused hash is stored: re-surfaces the
 *   raw token from BOOTSTRAP_TOKEN.txt (or regenerates if the file is gone).
 * - If no token exists at all: generates one, stores the hash, writes the file.
 *
 * The raw token is NEVER stored in the database — only its SHA-256 hash.
 */

const fs   = require('fs')
const path = require('path')
const db   = require('./db/database')
const { hashToken, generateToken } = require('./utils/crypto')

const TOKEN_FILE = path.join(__dirname, 'BOOTSTRAP_TOKEN.txt')

function checkBootstrap() {
  if (process.env.NODE_ENV === 'test') return

  const adminExists = db.prepare(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
  ).get()

  if (adminExists) {
    // Admins exist — bootstrap is permanently closed.  Remove the token file.
    if (fs.existsSync(TOKEN_FILE)) {
      try { fs.writeFileSync(TOKEN_FILE, '') } catch { /* ignore */ }
    }
    return
  }

  // No admin yet — ensure a bootstrap token is surfaced.
  const storedHash = db.prepare("SELECT value FROM app_meta WHERE key = 'bootstrap_token_hash'").get()
  const usedFlag   = db.prepare("SELECT value FROM app_meta WHERE key = 'bootstrap_used'").get()
  const isUsed     = usedFlag?.value === 'true'

  let rawToken = null

  if (storedHash && !isUsed) {
    // A valid unused token hash exists.  Try to read the raw token from the file.
    if (fs.existsSync(TOKEN_FILE)) {
      const candidate = fs.readFileSync(TOKEN_FILE, 'utf8').trim()
      if (candidate && hashToken(candidate) === storedHash.value) {
        rawToken = candidate  // File is intact and matches — reuse it
      }
    }
  }

  if (!rawToken) {
    // Generate a fresh token (first time, or file was deleted/corrupted)
    rawToken = generateToken(24) // 48 hex chars
    const tokenHash = hashToken(rawToken)
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('bootstrap_token_hash', ?)").run(tokenHash)
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('bootstrap_used', 'false')").run()
    fs.writeFileSync(TOKEN_FILE, rawToken)
  }

  printBootstrapToken(rawToken)
}

function printBootstrapToken(token) {
  const sep = '='.repeat(64)
  console.log('\n' + sep)
  console.log('  BOOTSTRAP TOKEN  —  create the first admin account')
  console.log('')
  console.log('  ' + token)
  console.log('')
  console.log('  Use this token at /bootstrap to create the first admin.')
  console.log('  Also saved to: server/BOOTSTRAP_TOKEN.txt')
  console.log('  This token is permanently invalidated once an admin exists.')
  console.log(sep + '\n')
}

/** Mark the bootstrap token as used and clear the file */
function consumeBootstrapToken() {
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('bootstrap_used', 'true')").run()
  try { fs.writeFileSync(TOKEN_FILE, '') } catch { /* ignore */ }
}

module.exports = { checkBootstrap, consumeBootstrapToken }
