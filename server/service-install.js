'use strict'
/**
 * service-install.js — Register Treetop Management Server as a Windows Service
 *
 * Run via install-service.bat (must be elevated / Run as Administrator).
 * Uses node-windows to create a persistent, auto-starting service that
 * restarts automatically on crash.
 *
 * Logs are written to the  daemon/  subfolder next to this script.
 * The service uses the same .env / JWT_SECRET / database as the start script.
 */

const path    = require('path')

let Service
try {
  Service = require('node-windows').Service
} catch {
  console.error('\n  ERROR: node-windows is not installed.')
  console.error('  Run install-service.bat — it installs node-windows automatically.\n')
  process.exit(1)
}

const svc = new Service({
  name:        'Treetop Management Server',
  description: 'Treetop Management practice management API server.',
  // Absolute path so the service always finds the script regardless of CWD.
  script:      path.join(__dirname, 'index.js'),
  // NODE_ENV=production is passed explicitly; dotenv in index.js loads the rest.
  env: [
    { name: 'NODE_ENV', value: 'production' },
  ],
  // Restart up to 3 times on crash; wait 2s, growing by 50% each retry.
  maxRetries: 3,
  wait:       2,
  grow:       0.5,
})

svc.on('install', () => {
  console.log('\n  Service installed successfully.')
  console.log('  Starting service...')
  svc.start()
})

svc.on('start', () => {
  const tokenFile = path.join(__dirname, 'BOOTSTRAP_TOKEN.txt')
  const logDir    = path.join(__dirname, 'daemon')
  console.log('\n  Service started.')
  console.log('')
  console.log('  The server is now running in the background and will start')
  console.log('  automatically every time Windows boots.')
  console.log('')
  console.log('  Bootstrap token (if this is the first run):')
  console.log('    ' + tokenFile)
  console.log('')
  console.log('  Service logs:')
  console.log('    ' + logDir)
  console.log('')
})

svc.on('alreadyinstalled', () => {
  console.log('\n  The service is already installed.')
  console.log('  To reinstall: run uninstall-service.bat first, then re-run install-service.bat.')
  console.log('')
})

svc.on('error', (err) => {
  console.error('\n  Service error:', err && (err.message || err))
})

console.log('\n  Installing "Treetop Management Server" as a Windows Service...')
svc.install()
