// Turns raw workflow instance documents into a public, readable history. Pure, so it is tested
// against real instance shapes. Only fields safe to publish leave this module: no account ids.

export type Actor = {id?: string; kind?: string} | null | undefined

export type HistoryEvent = {
  _key: string
  _type: string
  at: string
  actor?: Actor
  executionContext?: {id?: string; kind?: string} | null
  action?: string
  activity?: string
  stage?: string
  fromStage?: string
  toStage?: string
  transition?: string
  effect?: string
  resolved?: {item?: Record<string, unknown>; value?: unknown}
}

export type Step = {
  key: string
  at: string
  who: string
  kind: 'agent' | 'person' | 'system'
  what: string
  detail: string | null
}

const SYSTEMS: Record<string, string> = {
  'owambe-web': 'The website server',
  'bachs-webhook': 'The Bachs payment webhook',
}

/** Robot tokens have ids starting "g-"; the agent is recognised by its execution context. */
export function actorLabel(event: HistoryEvent, agentIds: ReadonlySet<string>): Pick<Step, 'who' | 'kind'> {
  const id = event.actor?.id ?? ''
  const context = event.executionContext?.id ?? ''
  if (agentIds.has(id) || context === 'owambe-agent') return {who: 'The agent', kind: 'agent'}
  if (SYSTEMS[context]) return {who: SYSTEMS[context], kind: 'system'}
  if (id.startsWith('g-') || id.startsWith('p-')) return {who: 'A server process', kind: 'system'}
  if (!id) return {who: 'The workflow engine', kind: 'system'}
  return {who: 'A signed-in person', kind: 'person'}
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Finds what a fired action wrote: a reason, a note, or who it was on behalf of. */
function detailsFor(fired: HistoryEvent, history: readonly HistoryEvent[]) {
  let onBehalfOf: string | null = null
  const parts: string[] = []
  for (const op of history) {
    if (op._type !== 'opApplied' || op.at !== fired.at || op.action !== fired.action) continue
    const payload = (op.resolved?.item ?? op.resolved?.value) as Record<string, unknown> | undefined
    if (!payload || typeof payload !== 'object') continue
    onBehalfOf ??= text(payload.onBehalfOf)
    for (const field of ['reason', 'body', 'note', 'summary'] as const) {
      const value = text(payload[field])
      if (value && !parts.includes(value)) parts.push(value)
    }
  }
  return {onBehalfOf, detail: parts.join(' ') || null}
}

export function readableHistory(
  history: readonly HistoryEvent[],
  titles: {stage: (name?: string) => string; action: (stage?: string, activity?: string, action?: string) => string},
  agentIds: ReadonlySet<string>,
): Step[] {
  const steps: Step[] = []
  for (const event of history) {
    const actor = actorLabel(event, agentIds)
    if (event._type === 'actionFired') {
      const {onBehalfOf, detail} = detailsFor(event, history)
      steps.push({
        key: event._key,
        at: event.at,
        ...actor,
        who: onBehalfOf && actor.kind === 'person' ? `A signed-in person, for ${onBehalfOf}` : actor.who,
        what: titles.action(event.stage, event.activity, event.action),
        detail,
      })
    } else if (event._type === 'transitionFired') {
      steps.push({key: event._key, at: event.at, ...actor, kind: 'system', who: 'The workflow', what: `Moved to ${titles.stage(event.toStage)}`, detail: null})
    } else if (event._type === 'effectCompleted') {
      steps.push({key: event._key, at: event.at, ...actor, what: `Finished ${humanise(event.effect)}`, detail: null})
    } else if (event._type === 'effectFailed') {
      steps.push({key: event._key, at: event.at, ...actor, what: `Could not finish ${humanise(event.effect)}`, detail: null})
    }
  }
  return steps
}

const humanise = (name?: string) => (name ?? 'a step').replace(/-/g, ' ')

/** Who a definition's action filter lets act, in words. */
export function whoCanAct(filter?: string): string {
  if (!filter) return 'Anyone with access'
  if (filter.includes('$actor.kind == "person"') && filter.includes('!string::startsWith($actor.id, "g-")')) return 'People only'
  if (filter.includes('string::startsWith($actor.id, "g-")')) return 'Server or agent only'
  return 'Restricted'
}
