import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSourceRule, isSourceRuleStale } from './localRules.js'

const valid = {
  ruleKey: 'bottle', type: 'recycle', sourceTitle: 'City recycling guide',
  sourceUrl: 'https://example.gov/recycling', authority: 'municipality',
  checkedDate: '2026-10-01', notes: 'Empty and rinse.', confirmed: true
}
const now = new Date('2026-10-30T12:00:00Z')

test('valid source-backed rule is normalized', () => {
  const result = validateSourceRule(valid, ['bottle'], now)
  assert.equal(result.userReviewed, true)
  assert.equal(result.sourceUrl, 'https://example.gov/recycling')
  assert.equal(result.type, 'recycle')
})

test('rejects non-HTTPS links', () => {
  assert.throws(() => validateSourceRule({...valid,sourceUrl:'http://example.gov'}, ['bottle'], now), /HTTPS/)
})

test('rejects unknown material keys and invalid categories', () => {
  assert.throws(() => validateSourceRule({...valid,ruleKey:'unknown-item'}, ['bottle'], now), /material/)
  assert.throws(() => validateSourceRule({...valid,type:'javascript'}, ['bottle'], now), /category/)
})

test('requires an explicit user confirmation and a non-future check date', () => {
  assert.throws(() => validateSourceRule({...valid,confirmed:false}, ['bottle'], now), /Confirm/)
  assert.throws(() => validateSourceRule({...valid,checkedDate:'2026-11-01'}, ['bottle'], now), /future/)
})

test('source freshness expires after the configured age', () => {
  assert.equal(isSourceRuleStale({checkedDate:'2026-10-01'}, now, 180), false)
  assert.equal(isSourceRuleStale({checkedDate:'2025-01-01'}, now, 180), true)
  assert.equal(isSourceRuleStale({checkedDate:'bad'}, now, 180), true)
})


test('future-dated or unparseable sources are stale', () => {
  assert.equal(isSourceRuleStale({checkedDate:'2026-11-01'}, now, 180), true)
  assert.equal(isSourceRuleStale({checkedDate:'not-a-date'}, now, 180), true)
})
