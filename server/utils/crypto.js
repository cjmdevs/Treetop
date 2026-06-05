const crypto = require('crypto')

/** SHA-256 hex hash of a raw token string */
const hashToken = raw => crypto.createHash('sha256').update(raw).digest('hex')

/** Generate a cryptographically random hex token of the given byte length */
const generateToken = (bytes = 24) => crypto.randomBytes(bytes).toString('hex')

module.exports = { hashToken, generateToken }
