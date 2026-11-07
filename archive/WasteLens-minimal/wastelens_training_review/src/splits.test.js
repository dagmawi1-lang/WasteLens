import test from 'node:test'
import assert from 'node:assert/strict'
import { createGroupSplit } from './splits.js'

const samples = []
for (const label of ['recycle','compost','trash','special']) {
  samples.push({ id: `${label}-a1`, label, groupId: `${label}-object-a` })
  samples.push({ id: `${label}-a2`, label, groupId: `${label}-object-a` })
  samples.push({ id: `${label}-b`, label, groupId: `${label}-object-b` })
  samples.push({ id: `${label}-c`, label, groupId: `${label}-object-c` })
}

test('records from the same object/session never cross splits', () => {
  const rows = createGroupSplit(samples)
  const groupSplits = new Map()
  for (const row of rows) {
    if (groupSplits.has(row.groupId)) assert.equal(row.split, groupSplits.get(row.groupId))
    groupSplits.set(row.groupId, row.split)
  }
  assert.equal(rows.find(row => row.id === 'recycle-a1').split, rows.find(row => row.id === 'recycle-a2').split)
})

test('split is deterministic regardless of input order', () => {
  const a = createGroupSplit(samples).sort((x,y)=>x.id.localeCompare(y.id))
  const b = createGroupSplit([...samples].reverse()).sort((x,y)=>x.id.localeCompare(y.id))
  assert.deepEqual(a.map(x=>[x.id,x.split]), b.map(x=>[x.id,x.split]))
})

test('each category with at least three independent groups gets all three splits', () => {
  const rows = createGroupSplit(samples)
  for (const label of ['recycle','compost','trash','special']) {
    assert.deepEqual(new Set(rows.filter(row=>row.label===label).map(row=>row.split)), new Set(['train','validation','test']))
  }
})

test('legacy samples without group IDs are treated as independent groups', () => {
  const rows = createGroupSplit([{id:'old-1',label:'recycle'},{id:'old-2',label:'recycle'},{id:'old-3',label:'recycle'}])
  assert.deepEqual(rows.map(row=>row.groupId).sort(), ['old-1','old-2','old-3'])
  assert.deepEqual(new Set(rows.map(row=>row.split)), new Set(['train','validation','test']))
})

test('two or fewer groups stay in training rather than fabricating a holdout set', () => {
  const rows = createGroupSplit([{id:'1',label:'recycle'},{id:'2',label:'recycle'}])
  assert.ok(rows.every(row=>row.split==='train'))
})

test('a group with conflicting labels is kept together in training', () => {
  const rows = createGroupSplit([
    {id:'same-a',label:'recycle',groupId:'conflict'},
    {id:'same-b',label:'trash',groupId:'conflict'},
    {id:'other-a',label:'recycle',groupId:'other-a'},
    {id:'other-b',label:'recycle',groupId:'other-b'}
  ])
  const conflictRows = rows.filter(row=>row.groupId==='conflict')
  assert.equal(new Set(conflictRows.map(row=>row.split)).size, 1)
  assert.ok(conflictRows.every(row=>row.groupLabelConflict && row.split==='train'))
})
