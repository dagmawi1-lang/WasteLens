import test from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_STEPS, getDemoProgress } from './demo.js'

test('competition demo checklist has unique stable step IDs', () => {
  const ids = DEMO_STEPS.map(step => step.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('privacy'))
  assert.ok(ids.includes('evaluation'))
})

test('demo progress ignores unknown and duplicate IDs', () => {
  assert.deepEqual(getDemoProgress(['scan','scan','unknown']), { completed: 1, total: 8, percent: 13 })
  assert.deepEqual(getDemoProgress(DEMO_STEPS.map(step=>step.id)), { completed: 8, total: 8, percent: 100 })
})
