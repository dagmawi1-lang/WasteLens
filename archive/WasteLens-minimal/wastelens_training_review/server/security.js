import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SYNC_KEYS = new Set(['history','region','customRules','sourceRules','programName','fieldTrials','feedback','modelEvaluation','modelComparisons'])

export function validUsername(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{3,24}$/.test(value)
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `${salt.toString('base64url')}.${Buffer.from(derived).toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const [saltText, hashText] = stored.split('.')
  if (!saltText || !hashText) return false
  try {
    const salt = Buffer.from(saltText, 'base64url')
    const expected = Buffer.from(hashText, 'base64url')
    if (salt.length !== 16 || expected.length !== 64) return false
    const actual = Buffer.from(await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }))
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function hashSessionToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

export function sanitizeSyncData(data, maxBytes = 300 * 1024) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Sync data must be an object.')
  const keys = Object.keys(data)
  const unsupported = keys.filter(key => !SYNC_KEYS.has(key))
  if (unsupported.length) throw new Error(`Unsupported sync fields: ${unsupported.join(', ')}.`)
  const serialized = JSON.stringify(data)
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new Error('Sync data exceeds the 300 KB limit.')
  const parsed = JSON.parse(serialized)
  const inspect = (value, depth = 0) => {
    if (depth > 24) throw new Error('Sync data is nested too deeply.')
    if (Array.isArray(value)) {
      for (const item of value) inspect(item, depth + 1)
      return
    }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (/image.?data|photo.?data|base64image/i.test(key)) throw new Error('Image data cannot be synchronized. Sync stores metadata only.')
        inspect(item, depth + 1)
      }
      return
    }
    if (typeof value === 'string' && /^data:image\//i.test(value)) throw new Error('Image data cannot be synchronized. Sync stores metadata only.')
  }
  inspect(parsed)
  return parsed
}
