import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeFieldTrials } from './fieldTrials.js'

const records = [
  { modelSource:'Model A', confidence:92, outcome:'confirmed', context:{lighting:'bright',background:'simple',angle:'front',distance:'close',captureMethod:'upload'} },
  { modelSource:'Model A', confidence:88, outcome:'corrected', context:{lighting:'dim',background:'cluttered',angle:'side',distance:'far',captureMethod:'camera'} },
  { modelSource:'Model B', confidence:55, outcome:'corrected', context:{lighting:'dim',background:'cluttered',angle:'side',distance:'far',captureMethod:'camera'} },
  { modelSource:'Model B', confidence:71, outcome:'pending', context:{lighting:'bright',background:'simple',angle:'front',distance:'medium',captureMethod:'upload'} }
]

test('summary counts only reviewed outcomes in correction rate', () => {
  const summary = summarizeFieldTrials(records)
  assert.equal(summary.total, 4)
  assert.equal(summary.verified, 3)
  assert.equal(summary.corrected, 2)
  assert.equal(summary.pending, 1)
  assert.equal(summary.correctionRate, 2/3)
})

test('summary groups reviewed outcomes by model and test condition', () => {
  const summary = summarizeFieldTrials(records)
  assert.equal(summary.byModel.length, 2)
  assert.equal(summary.byCondition.lighting.find(x=>x.name==='dim').verified, 2)
  assert.equal(summary.byCondition.captureMethod.find(x=>x.name==='camera').corrected, 2)
})

test('confidence bands exclude pending predictions', () => {
  const summary = summarizeFieldTrials(records)
  const high = summary.confidenceBands.find(x=>x.label==='90–100%')
  const mid = summary.confidenceBands.find(x=>x.label==='40–59%')
  assert.equal(high.verified, 1)
  assert.equal(high.corrected, 0)
  assert.equal(mid.verified, 1)
  assert.equal(mid.corrected, 1)
})

test('legacy records without context are retained in a not-recorded group', () => {
  const summary = summarizeFieldTrials([{modelSource:'Old model',outcome:'confirmed',confidence:60}])
  assert.equal(summary.byCondition.lighting[0].name, 'Not recorded')
})


test('reviewed category breakdown uses the human-selected category', () => {
  const summary = summarizeFieldTrials([{predictedType:'recycle',humanType:'trash',outcome:'corrected',confidence:80}])
  assert.equal(summary.byReviewedCategory[0].name, 'trash')
  assert.equal(summary.byReviewedCategory[0].corrected, 1)
})
