// The agent's side of the live-adjustment workflow: the two effect handlers the runtime registers.
// Kept free of environment-bound clients so the bench can run the real handlers
// (see adjust.test.ts); `serve.ts` wires them to the agent's token and Agent Actions.
import {describeDrift, fromWat, liveState, watDate, watTime, type LiveItemInput} from '@owambe/shared'
import {adjustmentFromParams, APPLY_EFFECT, PROPOSE_EFFECT} from '@owambe/workflows'
import type {EffectHandler} from '@sanity/workflow-engine'

import {ADJUST_INSTRUCTION, RETRY_SUFFIX} from './prompts'

type Rule = {requirement: string; reason: string | null}

type SegmentChange = {
  _key: string
  _type: 'segmentChange'
  item: {_type: 'reference'; _ref: string}
  fromStart: string
  fromDuration: number
  toStart: string
  toDuration: number
}

export type AdjustmentDoc = {
  _id: string
  note: string | null
  changes: SegmentChange[] | null
  appliedAt: string | null
  program: {_id: string; items: (LiveItemInput & {_rev: string; sideOfInterest: string | null; notes: string | null})[] | null} | null
  families: {side: string; rules: Rule[] | null}[]
}

export const ADJUSTMENT_QUERY = `*[_id == $id][0]{
  _id, note, changes, appliedAt,
  "program": program->{_id, "items": items[]->{_id, _rev, title, plannedStart, plannedDuration, actualStart, actualEnd, sideOfInterest, notes}},
  "families": *[_type == "familySide" && !(_id in path("drafts.**"))] | order(side asc){side, "rules": nonNegotiables[]{requirement, reason}}
}`

type Upcoming = {key: string; _id: string; title: string; plannedStart: string; plannedDuration: number; sideOfInterest: string | null; notes: string | null}

export type AdjustmentContext = {
  now: Date
  driftMinutes: number
  upcoming: Upcoming[]
  /** The first segment still to come cannot start before this (whole minute). */
  earliest: Date
  /** The program's own planned end. The adjustment must land inside it. */
  finishBy: Date
  /** The most minutes the proposal may cut in total: the lateness, plus a little room to land on a round time. */
  maxCut: number
  params: Record<string, string>
}

const MINUTE = 60_000
const CUT_SLACK_MINUTES = 10
const ceilMinute = (ms: number) => new Date(Math.ceil(ms / MINUTE) * MINUTE)

/** What the agent is told: what ran, what is on, what is left, and the limits. */
export function buildContext(doc: AdjustmentDoc, now: Date): AdjustmentContext {
  const items = (doc.program?.items ?? []).filter(Boolean)
  const state = liveState(items, now)
  const byId = new Map(items.map((i) => [i._id, i]))

  const upcoming: Upcoming[] = state.items
    .filter((i) => i.status === 'upcoming' && i.plannedStart && i.plannedDuration)
    .map((i, index) => ({
      key: `S${index + 1}`,
      _id: i._id,
      title: i.title ?? 'Untitled segment',
      plannedStart: i.plannedStart!,
      plannedDuration: i.plannedDuration!,
      sideOfInterest: byId.get(i._id)?.sideOfInterest ?? null,
      notes: byId.get(i._id)?.notes ?? null,
    }))

  const running = state.running
  const runningEnd = running?.actualStart && running.plannedDuration ? new Date(running.actualStart).getTime() + running.plannedDuration * MINUTE : null
  const earliest = ceilMinute(Math.max(now.getTime(), runningEnd ?? 0))
  const finishBy = state.plannedFinish ?? earliest

  const rules = (side: string) => {
    const list = doc.families.find((f) => f.side === side)?.rules ?? []
    return list.length ? list.map((r, i) => `${i + 1}. ${r.requirement}${r.reason ? ` (Why: ${r.reason})` : ''}`).join('\n') : 'None recorded.'
  }
  const done = state.items
    .filter((i) => i.status === 'done')
    .map((i) => `- ${i.title}: ${watTime(i.actualStart!)}–${watTime(i.actualEnd!)} (planned ${watTime(i.plannedStart!)}, ${i.plannedDuration} min)`)

  const maxCut = Math.max(state.driftMinutes, 0) + CUT_SLACK_MINUTES

  return {
    now,
    driftMinutes: state.driftMinutes,
    upcoming,
    earliest,
    finishBy,
    maxCut,
    params: {
      maxCut: String(maxCut),
      now: watTime(now),
      drift: describeDrift(state.driftMinutes),
      done: done.length ? done.join('\n') : 'Nothing yet.',
      running: running
        ? `${running.title}, started ${watTime(running.actualStart!)}, planned for ${running.plannedDuration} min (the coordinator ends it; you cannot change it).`
        : 'Nothing.',
      upcoming: upcoming
        .map((u) => `${u.key} | ${watTime(u.plannedStart)} | ${u.plannedDuration} min | ${u.sideOfInterest ?? 'both'} | ${u.title}${u.notes ? ` | ${u.notes}` : ''}`)
        .join('\n'),
      earliest: watTime(earliest),
      finishBy: watTime(finishBy),
      brideRules: rules('bride'),
      groomRules: rules('groom'),
      note: doc.note?.trim() || 'None.',
    },
  }
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY = 24 * 60 * MINUTE

/**
 * The model answers in "HH:MM". Read it as the instant nearest the segment's current planned
 * start, so a program that runs past midnight (a late night, or a rehearsal) lands on the right day.
 */
export function nearestInstant(hhmm: string, near: string): number {
  const reference = new Date(near).getTime()
  const candidate = fromWat(watDate(near), hhmm).getTime()
  if (candidate - reference > DAY / 2) return candidate - DAY
  if (reference - candidate > DAY / 2) return candidate + DAY
  return candidate
}

/**
 * The model's answer is untrusted. Check every rule the coordinator relies on and return
 * problems the model can fix on a retry, or the changes to propose.
 */
export function validateAdjustment(
  value: unknown,
  context: AdjustmentContext,
): {summary?: string; changes?: SegmentChange[]; problems: string[]} {
  const problems: string[] = []
  const answer = value as {summary?: unknown; items?: unknown} | null
  if (!answer || typeof answer !== 'object') return {problems: ['The answer is not a JSON object.']}
  if (typeof answer.summary !== 'string' || answer.summary.trim().length < 10) problems.push('"summary" must be two or three sentences.')
  if (!Array.isArray(answer.items)) return {problems: [...problems, '"items" must be a list.']}

  const items = answer.items as {key?: unknown; start?: unknown; durationMinutes?: unknown}[]
  const keys = items.map((i) => i?.key)
  const expected = context.upcoming.map((u) => u.key)
  if (keys.join() !== expected.join()) {
    problems.push(`"items" must list every segment still to come, in order, exactly once: ${expected.join(', ')}. You listed: ${keys.join(', ') || 'nothing'}.`)
    return {problems}
  }

  const changes: SegmentChange[] = []
  let previousEnd = context.earliest.getTime()
  items.forEach((item, i) => {
    const segment = context.upcoming[i]!
    const at = `${segment.key} ("${segment.title}")`
    if (typeof item.start !== 'string' || !HHMM.test(item.start)) {
      problems.push(`${at}: start must be "HH:MM" in 24-hour time.`)
      return
    }
    const duration = item.durationMinutes
    const minimum = Math.ceil(segment.plannedDuration / 2)
    if (typeof duration !== 'number' || !Number.isInteger(duration)) {
      problems.push(`${at}: durationMinutes must be a whole number.`)
      return
    }
    if (duration > segment.plannedDuration) problems.push(`${at}: ${duration} min is longer than planned (${segment.plannedDuration}). Never lengthen a segment.`)
    if (duration < minimum) problems.push(`${at}: ${duration} min cuts it below half its planned length (at least ${minimum}).`)

    const start = nearestInstant(item.start, segment.plannedStart)
    if (start < new Date(segment.plannedStart).getTime()) problems.push(`${at}: starts at ${item.start}, earlier than its planned ${watTime(segment.plannedStart)}. Never bring a segment forward.`)
    else if (i === 0 && start < context.earliest.getTime()) problems.push(`${at}: starts at ${item.start}, before ${watTime(context.earliest)}, the earliest it can start.`)
    else if (start < previousEnd) problems.push(`${at}: starts at ${item.start}, before the previous segment ends at ${watTime(new Date(previousEnd))}.`)
    previousEnd = start + duration * MINUTE

    const toStart = new Date(start).toISOString()
    if (start !== new Date(segment.plannedStart).getTime() || duration !== segment.plannedDuration) {
      changes.push({
        _key: segment._id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12),
        _type: 'segmentChange',
        item: {_type: 'reference', _ref: segment._id},
        fromStart: segment.plannedStart,
        fromDuration: segment.plannedDuration,
        toStart,
        toDuration: duration,
      })
    }
  })
  const cut = changes.reduce((total, c) => total + (c.fromDuration - c.toDuration), 0)
  if (cut > context.maxCut) problems.push(`You cut ${cut} minutes in total; the program is only ${context.driftMinutes} minutes late. Cut at most ${context.maxCut}.`)
  if (previousEnd > context.finishBy.getTime()) {
    problems.push(`The last segment ends at ${watTime(new Date(previousEnd))}, after ${watTime(context.finishBy)}. Shorten more, within the limits.`)
  }
  if (!problems.length && changes.length === 0) problems.push('Nothing changed. Re-time the segments so the program ends on time.')

  return problems.length ? {problems} : {summary: (answer.summary as string).trim(), changes, problems}
}

type ItemNow = {_id: string; _rev: string; title: string | null; plannedStart: string | null; plannedDuration: number | null; actualStart?: string | null}

const sameTime = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime()

/**
 * Decide what applying an approved adjustment writes. Refuses if any segment has started or was
 * moved by someone else since the proposal. A segment already at its new time is skipped, so
 * applying twice (an at-least-once redelivery) writes nothing new.
 */
export function planApply(changes: readonly SegmentChange[], items: readonly ItemNow[]): {writes: {id: string; rev: string; plannedStart: string; plannedDuration: number}[]} | {problem: string} {
  const byId = new Map(items.map((i) => [i._id, i]))
  const writes = []
  for (const change of changes) {
    const item = byId.get(change.item._ref)
    if (!item) return {problem: 'A segment in the proposal is no longer in the program. Nothing was changed; ask the agent again.'}
    const title = item.title ?? 'A segment'
    if (sameTime(item.plannedStart, change.toStart) && item.plannedDuration === change.toDuration) continue
    if (item.actualStart) return {problem: `"${title}" has started since the proposal. Nothing was changed; ask the agent again.`}
    if (!sameTime(item.plannedStart, change.fromStart) || item.plannedDuration !== change.fromDuration) {
      return {problem: `"${title}" was re-timed by someone else since the proposal. Nothing was changed; ask the agent again.`}
    }
    writes.push({id: item._id, rev: item._rev, plannedStart: change.toStart, plannedDuration: change.toDuration})
  }
  return {writes}
}

export type PromptFn = (request: {instruction: string; instructionParams: Record<string, string>}) => Promise<unknown>

type Ctx = Parameters<EffectHandler>[1]

/** Record why on the instance (a failed effect keeps no error text), then fail the effect. */
async function fail(ctx: Ctx, problem: string): Promise<never> {
  await ctx.commitOps({
    idempotencyKey: `${ctx.effectKey}:problem`,
    ops: [{type: 'field.set', target: {scope: 'workflow', field: 'problem'}, value: {type: 'literal', value: problem.slice(0, 1000)}}],
  })
  throw new Error(problem)
}

export function adjustmentHandlers(deps: {prompt: PromptFn; now?: () => Date; log?: (line: string) => void}): Record<string, EffectHandler> {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? (() => {})

  const propose: EffectHandler = async (params, ctx) => {
    const adjustment = adjustmentFromParams(params)
    const client = ctx.clientFor(adjustment.uri)
    const doc = await client.fetch<AdjustmentDoc | null>(ADJUSTMENT_QUERY, {id: adjustment.documentId})
    if (!doc?.program) return fail(ctx, 'The adjustment does not point at a program.')
    const context = buildContext(doc, now())
    if (context.upcoming.length === 0) return fail(ctx, 'Every segment has already started, so there is nothing left to re-time.')

    let problems: string[] = []
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await deps.prompt({
        instruction: problems.length ? ADJUST_INSTRUCTION + RETRY_SUFFIX : ADJUST_INSTRUCTION,
        instructionParams: problems.length ? {...context.params, problems: problems.map((p) => `- ${p}`).join('\n')} : context.params,
      })
      const result = validateAdjustment(response, context)
      if (result.changes && result.summary) {
        log(`Prompt attempt ${attempt}: accepted (${result.changes.length} segments re-timed).`)
        await client.patch(adjustment.documentId).set({summary: result.summary, changes: result.changes}).commit()
        return
      }
      problems = result.problems
      log(`Prompt attempt ${attempt}: rejected by validator:\n  ${problems.join('\n  ')}`)
    }
    return fail(ctx, `The agent could not produce a valid proposal after 3 attempts. Last problems: ${problems.slice(0, 3).join(' ')}`)
  }

  const apply: EffectHandler = async (params, ctx) => {
    const adjustment = adjustmentFromParams(params)
    const client = ctx.clientFor(adjustment.uri)
    const doc = await client.fetch<AdjustmentDoc | null>(ADJUSTMENT_QUERY, {id: adjustment.documentId})
    if (!doc?.program || !doc.changes?.length) return fail(ctx, 'There is no approved proposal to apply.')
    const plan = planApply(doc.changes, (doc.program.items ?? []).filter(Boolean) as ItemNow[])
    if ('problem' in plan) return fail(ctx, plan.problem)

    if (plan.writes.length === 0 && doc.appliedAt) return // Already applied by an earlier delivery.
    const tx = client.transaction()
    // Each segment is written only if nobody touched it since it was read.
    for (const write of plan.writes) {
      tx.patch(client.patch(write.id).ifRevisionId(write.rev).set({plannedStart: write.plannedStart, plannedDuration: write.plannedDuration}))
    }
    if (!doc.appliedAt) tx.patch(client.patch(adjustment.documentId).set({appliedAt: now().toISOString()}))
    try {
      await tx.commit()
    } catch (error) {
      // Almost always a revision mismatch: a segment was edited between the read and this write.
      const detail = error instanceof Error ? error.message : String(error)
      return fail(ctx, `A segment changed while the times were being written, so nothing was changed; ask the agent again. (${detail.slice(0, 200)})`)
    }
    log(`Applied: ${plan.writes.length} segments re-timed.`)
  }

  return {[PROPOSE_EFFECT]: propose, [APPLY_EFFECT]: apply}
}
