'use strict'
/**
 * service-uninstall.js — Remove the Treetop Management Server Windows Service
 *
 * Run via uninstall-service.bat (must be elevated / Run as Administrator).
 * Your database and .env file are not touched.
 */

const path = require('path')

let Service
try {
  Service = require('node-windows').Service
} catch {
  console.error('\n  ERROR: node-windows is not installed — the service cannot be managed.')
  console.error('  If the service is still showing in Services, it may need to be removed manually.\n')
  process.exit(1)
}

const svc = new Service({
  name:   'Treetop Management Server',
  script: path.join(__dirname, 'index.js'),
})

svc.on('uninstall', () => {
  console.log('\n  Service removed successfully.')
  console.log('  The server will no longer start automatically on boot.')
  console.log('  Your database and .env file are untouched.')
  console.log('')
})

svc.on('notinstalled', () => {
  console.log('\n  The service is not currently installed — nothing to remove.')
  console.log('')
})

svc.on('error', (err) => {
  console.error('\n  Error:', err && (err.message || err))
})

console.log('\n  Removing "Treetop Management Server" Windows Service...')
svc.uninstall()
