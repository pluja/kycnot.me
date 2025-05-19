import crypto from 'crypto'

// Generate a 32-byte secret key once when the module is first loaded
const timeTrapSecretKey = crypto.randomBytes(32)

export { timeTrapSecretKey }
