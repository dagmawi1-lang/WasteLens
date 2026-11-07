const VERIFIED = new Set(['confirmed', 'corrected'])
const CONFIDENCE_BANDS = [
  { label: '0–39%', min: 0, max: 39 },
  { label: '40–59%', min: 40, max: 59 },
  { label: '60–79%', min: 60, max: 79 },
  { label: '80–89%', min: 80, max: 89 },
  { label: '90–100%', min: 90, max: 100 }
]

function summarize(rows) {
  const verified = rows.filter(row => VERIFIED.has(row.outcome))
  const corrected = verified.filter(row => row.outcome === 'corrected')
  return {
    total: rows.length,
    verified: verified.length,
    confirmed: verified.length - corrected.length,
    corrected: corrected.length,
    pending: rows.length - verified.length,
    correctionRate: verified.length ? corrected.length / verified.length : null,
    averageConfidence: verified.length ? verified.reduce((sum, row) => sum + Number(row.confidence || 0), 0) / verified.length : null
  }
}

function groupBy(rows, getKey) {
  const groups = new Map()
  for (const row of rows) {
    const key = getKey(row) || 'Not recorded'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.entries()].map(([name, items]) => ({ name, ...summarize(items) })).sort((a,b) => a.name.localeCompare(b.name))
}

export function summarizeFieldTrials(rows = []) {
  const verified = rows.filter(row => VERIFIED.has(row.outcome))
  return {
    ...summarize(rows),
    byModel: groupBy(rows, row => row.modelSource),
    byReviewedCategory: groupBy(verified, row => row.humanType || row.predictedType),
    byCondition: {
      lighting: groupBy(rows, row => row.context?.lighting),
      background: groupBy(rows, row => row.context?.background),
      angle: groupBy(rows, row => row.context?.angle),
      distance: groupBy(rows, row => row.context?.distance),
      captureMethod: groupBy(rows, row => row.context?.captureMethod)
    },
    confidenceBands: CONFIDENCE_BANDS.map(band => {
      const items = verified.filter(row => {
        const confidence = Number(row.confidence || 0)
        return confidence >= band.min && confidence <= band.max
      })
      const stats = summarize(items)
      return { ...band, verified: stats.verified, corrected: stats.corrected, correctionRate: stats.correctionRate }
    })
  }
}
