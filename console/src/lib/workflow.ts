// Reading workflow instances for display. Pure functions over the instance document, so the
// board and the approvals list can show stage, "waiting on" and history without opening a
// live session per row (the docs advise against a session per list row).
import type {HistoryEntry, WorkflowDefinition, WorkflowInstance} from '@sanity/workflow-engine'

export type InstanceLike = Pick<WorkflowInstance, 'definition' | 'currentStage' | 'stages' | 'definitionSnapshot' | 'completedAt' | 'abortedAt'>

const definitions = new WeakMap<object, WorkflowDefinition | null>()

/** The definition this instance is pinned to, from its own snapshot (not the latest deployed). */
export function definitionOf(instance: Pick<WorkflowInstance, 'definitionSnapshot'>): WorkflowDefinition | null {
  if (definitions.has(instance)) return definitions.get(instance)!
  let parsed: WorkflowDefinition | null = null
  try {
    parsed = JSON.parse(instance.definitionSnapshot) as WorkflowDefinition
  } catch {
    parsed = null
  }
  definitions.set(instance, parsed)
  return parsed
}

export function stageTitle(instance: InstanceLike, stage = instance.currentStage): string {
  return definitionOf(instance)?.stages.find((s) => s.name === stage)?.title ?? stage
}

export function actionTitle(instance: InstanceLike, stage: string, activity: string, action: string): string {
  const found = definitionOf(instance)
    ?.stages.find((s) => s.name === stage)
    ?.activities?.find((a) => a.name === activity)
    ?.actions?.find((a) => a.name === action)
  return found?.title ?? action
}

/** Who each activity is really waiting on, in the coordinator's words. Empty string: nobody to chase. */
const WAITING_ON: Record<string, Record<string, string>> = {
  'program-approval': {
    draft: 'The agent (drafting)',
    'bride-approval': 'Bride’s family',
    'groom-approval': 'Groom’s family',
    lock: 'Coordinator (lock for print)',
    reopen: '',
  },
  'aso-ebi-order': {
    checkout: 'Guest (to open a checkout)',
    payment: 'Bachs (payment)',
    'payment-failure': '',
    handoff: 'Coordinator (hand off the fabric)',
    sewing: 'Tailor',
    collection: 'Guest (to collect)',
  },
  'live-adjustment': {
    propose: 'The agent (proposing)',
    withdraw: '',
    decide: 'Coordinator (approve or reject)',
    apply: 'The agent (applying)',
  },
}

export function waitingOn(instance: InstanceLike): string[] {
  if (instance.completedAt || instance.abortedAt) return []
  const visit = instance.stages.at(-1)
  if (!visit || visit.name !== instance.currentStage) return []
  const names = WAITING_ON[instance.definition] ?? {}
  return visit.activities
    .filter((a) => a.status === 'active')
    .map((a) => names[a.name] ?? a.name)
    .filter((label) => label !== '')
}

export function isFinished(instance: InstanceLike): boolean {
  return Boolean(instance.completedAt || instance.abortedAt)
}

/** Labels for the robots and hosts that show up in history, keyed by their declared execution context id. */
const CONTEXT_LABELS: Record<string, string> = {
  'owambe-agent': 'Agent',
  'owambe-web': 'Web server',
  'bachs-webhook': 'Bachs payment webhook',
  'bachs-simulator': 'Bachs simulator (local test)',
  'bachs-live-verify': 'Build verification script',
  'phase4-verify': 'Build verification script',
  'workflow-cli': 'Workflows CLI',
}

/** Robot token ids: "g-…" (current CLI) or "p-…" (older project robots). See packages/workflows/src/actors.ts. */
export const isRobotId = (id: string) => id.startsWith('g-') || id.startsWith('p-')

/** A name for whoever caused a history entry. People resolve through the user directory (`personName`). */
export function actorLabel(entry: Pick<HistoryEntry, 'executionContext'> & {actor?: {id: string} | undefined}, personName?: string): string {
  const id = entry.actor?.id
  const context = entry.executionContext?.id
  if (!id) return context ? (CONTEXT_LABELS[context] ?? context) : 'The engine'
  if (isRobotId(id)) return (context && CONTEXT_LABELS[context]) ?? `Robot ${id}`
  return personName ?? 'A person'
}

export type TimelineRow = {key: string; at: string; text: string; actorId?: string; entry: HistoryEntry; tone: 'default' | 'positive' | 'critical' | 'caution'}

/** The history entries worth showing a coordinator, oldest first. Bookkeeping entries are left out. */
export function timeline(instance: InstanceLike & Pick<WorkflowInstance, 'history'>): TimelineRow[] {
  const rows: TimelineRow[] = []
  for (const entry of instance.history) {
    const actorId = 'actor' in entry ? entry.actor?.id : undefined
    const base = {key: entry._key, at: entry.at, entry, ...(actorId ? {actorId} : {})}
    switch (entry._type) {
      case 'actionFired':
        if (entry.triggered) break
        rows.push({...base, text: actionTitle(instance, entry.stage, entry.activity, entry.action), tone: 'default'})
        break
      case 'transitionFired':
        rows.push({...base, text: `${stageTitle(instance, entry.fromStage)} → ${stageTitle(instance, entry.toStage)}`, tone: 'positive'})
        break
      case 'effectCompleted':
        rows.push({...base, text: `${entry.effect}: ${entry.status}`, tone: entry.status === 'done' ? 'default' : 'critical'})
        break
      case 'aborted':
        rows.push({...base, text: `Stopped${entry.reason ? `: ${entry.reason}` : ''}`, tone: 'caution'})
        break
      default:
        break
    }
  }
  return rows
}

/** A workflow field's current value: stage-scoped values on the open visit win over workflow-scoped ones. */
export function fieldValue<T>(instance: Pick<WorkflowInstance, 'fields' | 'stages'>, name: string): T | undefined {
  const stageField = instance.stages.at(-1)?.fields.find((f) => f.name === name)
  if (stageField && stageField.value !== undefined && stageField.value !== null) return stageField.value as T
  return instance.fields.find((f) => f.name === name)?.value as T | undefined
}

/** The bare document id of an instance's subject (its GDR is `dataset:<project>:<dataset>:<id>`). */
export function subjectId(instance: Pick<WorkflowInstance, 'fields'>): string | null {
  const value = instance.fields.find((f) => f.name === 'subject')?.value as {id?: string} | undefined
  const uri = value?.id
  return typeof uri === 'string' ? (uri.split(':').at(-1) ?? null) : null
}
