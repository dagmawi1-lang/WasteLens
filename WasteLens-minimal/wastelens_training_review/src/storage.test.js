import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStoredJSON, safeGetJSON, safeSetJSON, safeGetText, safeSetText } from './storage.js'

test('parseStoredJSON parses valid JSON', () => {
  assert.deepEqual(parseStoredJSON('{"ok":true}', {}), { ok: true })
})

test('parseStoredJSON returns fallback for empty or malformed values', () => {
  const fallback = []
  assert.equal(parseStoredJSON('', fallback), fallback)
  assert.equal(parseStoredJSON('{broken', fallback), fallback)
  assert.equal(parseStoredJSON(null, fallback), fallback)
})

test('safeGetJSON returns fallback when storage is unavailable or throws', () => {
  assert.deepEqual(safeGetJSON('x', { safe: true }, null), { safe: true })
  const broken = { getItem() { throw new Error('blocked') } }
  assert.deepEqual(safeGetJSON('x', [1], broken), [1])
})

test('safeGetJSON reads stored JSON and safeSetJSON writes JSON', () => {
  const values = new Map()
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, value) }
  }
  assert.equal(safeSetJSON('prefs', { theme: 'dark' }, storage), true)
  assert.deepEqual(safeGetJSON('prefs', {}, storage), { theme: 'dark' })
})

test('safeSetJSON reports quota and access errors without throwing', () => {
  const broken = { setItem() { throw new Error('quota exceeded') } }
  assert.equal(safeSetJSON('x', {}, broken), false)
})


test('safeGetText and safeSetText handle unavailable and blocked storage', () => {
  const values = new Map()
  const storage = { getItem(key) { return values.get(key) ?? null }, setItem(key, value) { values.set(key, value) } }
  assert.equal(safeSetText('region', 'virginia', storage), true)
  assert.equal(safeGetText('region', 'general', storage), 'virginia')
  assert.equal(safeGetText('region', 'general', null), 'general')
  assert.equal(safeSetText('region', 'custom', { setItem() { throw new Error('blocked') } }), false)
})


test('storage method exceptions are caught', () => {
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.deepEqual(safeGetJSON('x', [], broken), [])
  assert.equal(safeSetJSON('x', [], broken), false)
})
