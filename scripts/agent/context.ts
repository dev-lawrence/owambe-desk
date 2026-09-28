import {refDataset, type WorkflowInstance} from '@sanity/workflow-engine'

import {contentClient, DATASET, engine, PROJECT_ID, WORKFLOW_TAG} from './clients'

export type Rule = {requirement: string; reason: string | null}

export type DraftContext = {
  event: {_id: string; title: string; date: string; venue: string | null; city: string}
  program: {_id: string; version: number; brief: string; itemIds: string[]}
  families: {side: 'bride' | 'groom'; approvers: string[]; rules: Rule[]; notes: string | null}[]
  /** People and businesses the agent may make responsible for a segment. Short keys, not ids. */
  owners: {key: string; id: string; name: string; role: string; side: string; business: string | null}[]
  /** The current draft, if there is one: what a redraft starts from. */
  currentItems: {title: string; start: string; durationMinutes: number; sideOfInterest: string; owner: string | null; notes: string | null}[]
}

const CONTEXT_QUERY = `{
  "event": *[_type == "event"] | order(date asc)[0]{_id, title, date, "venue": venue.name, city},
  "program": *[_type == "programOfEvents" && !(_id in path("drafts.**"))] | order(_createdAt asc)[0]{
    _id, version, brief, "itemIds": items[]._ref,
    "items": items[]->{title, plannedStart, plannedDuration, sideOfInterest, "owner": owner->name, notes}
  },
  "families": *[_type == "familySide"] | order(side asc){
    side, "approvers": approvers[]->name, "rules": nonNegotiables[]{requirement, reason}, notes
  },
  "people": *[_type == "person" && role in ["celebrant", "parent", "elder", "coordinator", "mc", "vendorContact"]]
    | order(role asc, name asc){
      _id, name, role, side,
      "business": *[_type == "vendor" && contact._ref == ^._id][0]{name, category}
    }
}`

type RawContext = {
  event: DraftContext['event'] | null
  program: {
    _id: string
    version: number | null
    brief: string
    itemIds: string[] | null
    items: {title: string; plannedStart: string; plannedDuration: number; sideOfInterest: string; owner: string | null; notes: string | null}[] | null
  } | null
  families: {side: 'bride' | 'groom'; approvers: string[] | null; rules: Rule[] | null; notes: string | null}[]
  people: {_id: string; name: string; role: string; side: string; business: {name: string; category: string} | null}[]
}

/** "14:05" in West Africa Time for an ISO timestamp. */
export function watTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos'}).format(new Date(iso))
}

export async function loadContext(): Promise<DraftContext> {
  const raw = await contentClient.fetch<RawContext>(CONTEXT_QUERY)
  if (!raw.event) throw new Error('No event in the dataset. Run `pnpm seed` first.')
  if (!raw.program) throw new Error('No program of events in the dataset. Run `pnpm seed` first.')

  return {
    event: raw.event,
    program: {
      _id: raw.program._id,
      version: raw.program.version ?? 0,
      brief: raw.program.brief,
      itemIds: raw.program.itemIds ?? [],
    },
    families: raw.families.map((f) => ({side: f.side, approvers: f.approvers ?? [], rules: f.rules ?? [], notes: f.notes})),
    owners: raw.people.map((p, i) => ({
      key: `P${i + 1}`,
      id: p._id,
      name: p.name,
      role: p.role,
      side: p.side,
      business: p.business ? `${p.business.name} (${p.business.category})` : null,
    })),
    currentItems: (raw.program.items ?? []).map((item) => ({
      title: item.title,
      start: watTime(item.plannedStart),
      durationMinutes: item.plannedDuration,
      sideOfInterest: item.sideOfInterest,
      owner: item.owner,
      notes: item.notes,
    })),
  }
}

export function programSubject(programId: string) {
  return refDataset({projectId: PROJECT_ID, dataset: DATASET, documentId: programId, type: 'programOfEvents'})
}

/** The unfinished approval instance for this program, if one exists. */
export async function findApproval(programId: string): Promise<WorkflowInstance | null> {
  const subject = programSubject(programId)
  const ids = await engine.query<string[]>({
    groq: `*[_type == "sanity.workflow.instance" && tag == $tag && definition == "program-approval"
       && !defined(completedAt) && count(fields[name == "subject" && value.id == $subject]) > 0]
       | order(startedAt desc)._id`,
    params: {subject: subject.id},
  })
  const [id] = ids
  return id ? engine.getInstance({instanceId: id}) : null
}

export function fieldValue<T>(instance: WorkflowInstance, name: string): T | undefined {
  return instance.fields.find((field) => field.name === name)?.value as T | undefined
}

export {WORKFLOW_TAG}
