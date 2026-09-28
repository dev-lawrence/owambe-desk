import {SIDES_OF_INTEREST, type SideOfInterest} from '@owambe/shared'

export type ProposedItem = {
  title: string
  start: string
  durationMinutes: number
  sideOfInterest: SideOfInterest
  ownerKey: string | null
  notes: string | null
}

export type Proposal = {
  summary: string
  items: ProposedItem[]
  rulesCheck: {side: string; requirement: string; howSatisfied: string}[]
}

export type Rejection = {side: string; reason: string; onBehalfOf?: string; at?: string}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/**
 * The LLM's answer is untrusted input. Check every property the rest of the system relies on,
 * and return human-readable problems the model can fix on a retry.
 */
export function validateProposal(value: unknown, ownerKeys: ReadonlySet<string>): {proposal?: Proposal; problems: string[]} {
  const problems: string[] = []
  const p = value as Partial<Proposal> | null
  if (!p || typeof p !== 'object') return {problems: ['The answer is not a JSON object.']}
  if (typeof p.summary !== 'string' || p.summary.trim().length < 10) problems.push('"summary" must be two or three sentences.')
  if (!Array.isArray(p.items) || p.items.length < 6 || p.items.length > 24) {
    problems.push('"items" must be a list of 6 to 24 segments.')
    return {problems}
  }

  let previousEnd = -1
  p.items.forEach((item, i) => {
    const at = `items[${i}] ("${item?.title ?? '?'}")`
    if (typeof item?.title !== 'string' || item.title.trim().length < 3) problems.push(`${at}: title is missing.`)
    if (typeof item?.start !== 'string' || !HHMM.test(item.start)) {
      problems.push(`${at}: start must be "HH:MM" in 24-hour time.`)
      return
    }
    if (!Number.isInteger(item.durationMinutes) || item.durationMinutes < 1 || item.durationMinutes > 240) {
      problems.push(`${at}: durationMinutes must be a whole number from 1 to 240.`)
      return
    }
    if (!SIDES_OF_INTEREST.some((s) => s.value === item.sideOfInterest)) problems.push(`${at}: sideOfInterest must be "bride", "groom" or "both".`)
    if (item.ownerKey !== null && !ownerKeys.has(item.ownerKey)) problems.push(`${at}: ownerKey "${item.ownerKey}" is not one of the listed people. Use null if nobody fits.`)
    const start = minutes(item.start)
    if (start < 12 * 60) problems.push(`${at}: starts before noon; the reception runs in the afternoon and evening.`)
    if (start < previousEnd) problems.push(`${at}: starts at ${item.start}, before the previous segment ends.`)
    previousEnd = start + item.durationMinutes
  })
  if (previousEnd > 22 * 60) problems.push('The last segment must end by 22:00: the hall has to be cleared by 10pm.')
  if (!Array.isArray(p.rulesCheck) || p.rulesCheck.length === 0) problems.push('"rulesCheck" must list how each family non-negotiable is satisfied.')

  return problems.length ? {problems} : {proposal: p as Proposal, problems}
}
