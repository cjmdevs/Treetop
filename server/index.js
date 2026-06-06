// ── Load .env FIRST — before any module reads process.env ────────────────────
// dotenv must run before require('./app') because app.js pulls in middleware/auth.js
// which reads process.env.JWT_SECRET at module-load time.  The path is __dirname-
// relative so it works regardless of what directory Node was launched from
// (important when running as a Windows Service).
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const os              = require('os')
const app             = require('./app')
const { checkBootstrap } = require('./bootstrap')

const PORT = Number(process.env.PORT) || 3001

// ── LAN IP hint ───────────────────────────────────────────────────────────────
// Finds the first non-loopback IPv4 address so we can print a useful startup
// message.  Falls back gracefully if the machine has no active network adapter.
function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return null
}

// ── Bootstrap check ───────────────────────────────────────────────────────────
// Prints + saves the one-time bootstrap token when no admin user exists yet.
// This runs BEFORE listen() so the token appears before the "server ready" line.
checkBootstrap()

// ── Start listening ───────────────────────────────────────────────────────────
// Bind to 0.0.0.0 (all interfaces) so the server is reachable via the machine's
// LAN IP, not just localhost.
const server = app.listen(PORT, '0.0.0.0', () => {
  const lan  = getLanIp()
  const line = '─'.repeat(58)
  console.log('\n' + line)
  console.log('  Treetop Management Server  —  running')
  console.log(line)
  console.log(`  Local:   http://localhost:${PORT}`)
  if (lan) {
    console.log(`  Network: http://${lan}:${PORT}`)
    console.log(`           (share this address with client machines on your LAN)`)
  } else {
    console.log(`  Network: run  ipconfig  to find your LAN IP address`)
  }
  console.log(line + '\n')
})

// ── Friendly error for the most common startup failure ────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ERROR: Port ${PORT} is already in use.`)
    console.error(`  Another copy of the server may already be running.`)
    console.error(`  Stop the other instance first, or change PORT= in your .env file.\n`)
    process.exit(1)
  }
  throw err
})
