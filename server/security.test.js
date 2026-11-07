import test from 'node:test'
import assert from 'node:assert/strict'
import { validUsername, validPassword, hashPassword, verifyPassword, hashSessionToken, sanitizeSyncData } from './security.js'

test('username and password policies reject weak values', () => {
  assert.equal(validUsername('waste_user'), true)
  assert.equal(validUsername('ab'), false)
  assert.equal(validUsername('bad name'), false)
  assert.equal(validPassword('a-secure-password-123'), true)
  assert.equal(validPassword('short'), false)
})

test('password hashing verifies the original without storing plaintext', async () => {
  const stored = await hashPassword('correct horse battery staple')
  assert.notEqual(stored, 'correct horse battery staple')
  assert.equal(await verifyPassword('correct horse battery staple', stored), true)
  assert.equal(await verifyPassword('incorrect password', stored), false)
})

test('session tokens are represented by one-way hashes', () => {
  assert.equal(hashSessionToken('token-a').length, 64)
  assert.notEqual(hashSessionToken('token-a'), 'token-a')
})

test('sync accepts only allowlisted non-image metadata', () => {
  const clean = sanitizeSyncData({ history: [{ label: 'Bottle' }], region: 'county' })
  assert.equal(clean.history[0].label, 'Bottle')
  assert.throws(() => sanitizeSyncData({ unknownField: true }), /Unsupported/)
  assert.throws(() => sanitizeSyncData({ dataset: [{ imageData: 'data:image/png;base64,abc' }] }), /Unsupported/)
  assert.throws(() => sanitizeSyncData({ history: [{ imageData: 'data:image/png;base64,abc' }] }), /Image data/)
})

test('sync payload size and nesting are bounded', () => {
  assert.throws(() => sanitizeSyncData({ history: ['x'.repeat(310 * 1024)] }), /300 KB/)
  let nested = 'end'
  for (let i=0;i<27;i++) nested = { child: nested }
  assert.throws(() => sanitizeSyncData({ history: [nested] }), /nested too deeply/)
})
