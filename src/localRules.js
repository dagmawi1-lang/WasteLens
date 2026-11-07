const TYPES = new Set(['recycle', 'compost', 'trash', 'special', 'unknown'])
const AUTHORITIES = new Set(['municipality', 'waste-hauler', 'state-agency', 'regional-authority', 'other'])

export function validateSourceRule(draft, allowedRuleKeys, now = new Date()) {
  const ruleKey = String(draft.ruleKey || '').trim()
  const sourceTitle = String(draft.sourceTitle || '').trim()
  const sourceUrl = String(draft.sourceUrl || '').trim()
  const authority = String(draft.authority || '')
  const checkedDate = String(draft.checkedDate || '')
  if (!allowedRuleKeys.includes(ruleKey)) throw new Error('Choose a material from the WasteLens guide.')
  if (!TYPES.has(draft.type)) throw new Error('Choose a valid disposal category.')
  if (!sourceTitle || sourceTitle.length > 120) throw new Error('Enter a source title of 1 to 120 characters.')
  if (!AUTHORITIES.has(authority)) throw new Error('Choose the source authority type.')
  let parsedUrl
  try { parsedUrl = new URL(sourceUrl) } catch { throw new Error('Enter a valid official source URL.') }
  if (parsedUrl.protocol !== 'https:') throw new Error('Source links must use HTTPS.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedDate) || Number.isNaN(Date.parse(`${checkedDate}T00:00:00Z`))) throw new Error('Enter the date you checked the source.')
  const date = new Date(`${checkedDate}T00:00:00Z`)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (date > today) throw new Error('The source check date cannot be in the future.')
  if (draft.confirmed !== true) throw new Error('Confirm that you reviewed the source and that it applies to this waste program.')
  return {
    ruleKey,
    type: draft.type,
    sourceTitle,
    sourceUrl: parsedUrl.toString(),
    authority,
    checkedDate,
    notes: String(draft.notes || '').trim().slice(0, 300),
    addedAt: now.toISOString(),
    userReviewed: true
  }
}

export function isSourceRuleStale(rule, now = new Date(), maxAgeDays = 180) {
  const checked = Date.parse(`${rule?.checkedDate || ''}T00:00:00Z`)
  if (!Number.isFinite(checked)) return true
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return checked > today || (today - checked) / 86400000 > maxAgeDays
}
