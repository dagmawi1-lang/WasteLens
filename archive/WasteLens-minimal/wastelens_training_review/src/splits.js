/**
 * Deterministic, class-stratified, group-aware dataset split.
 * All photos sharing a groupId stay together. Groups are stratified within
 * each label when possible, while a group carrying conflicting labels is
 * conservatively kept in training for manual review.
 */
export function createGroupSplit(samples = []) {
  const groups = new Map()
  for (const sample of samples) {
    const groupId = String(sample.groupId || sample.id)
    if (!groups.has(groupId)) groups.set(groupId, { samples: [], labels: new Set() })
    const group = groups.get(groupId)
    group.samples.push(sample)
    group.labels.add(sample.label ?? '')
  }

  const assignments = new Map()
  const mixedLabelGroups = new Set()
  for (const [groupId, group] of groups) {
    if (group.labels.size > 1) {
      assignments.set(groupId, 'train')
      mixedLabelGroups.add(groupId)
    }
  }

  const labels = [...new Set(samples.map(sample => sample.label ?? ''))].sort()
  for (const label of labels) {
    const ids = [...groups.entries()]
      .filter(([groupId, group]) => !mixedLabelGroups.has(groupId) && group.labels.has(label))
      .map(([groupId]) => groupId)
      .sort((a, b) => stableHash(a) - stableHash(b) || a.localeCompare(b))
    const total = ids.length
    let trainCount = total >= 3 ? Math.max(1, Math.floor(total * 0.7)) : total
    let validationCount = total >= 3 ? Math.max(1, Math.floor(total * 0.15)) : 0
    if (total >= 3 && trainCount + validationCount >= total) {
      trainCount = total - 2
      validationCount = 1
    }
    ids.forEach((groupId, index) => {
      const split = index < trainCount ? 'train' : index < trainCount + validationCount ? 'validation' : 'test'
      assignments.set(groupId, split)
    })
  }

  return samples.map(sample => {
    const groupId = String(sample.groupId || sample.id)
    return {
      id: sample.id,
      label: sample.label,
      groupId,
      split: assignments.get(groupId) || 'train',
      createdAt: sample.createdAt,
      groupLabelConflict: mixedLabelGroups.has(groupId)
    }
  })
}

function stableHash(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
