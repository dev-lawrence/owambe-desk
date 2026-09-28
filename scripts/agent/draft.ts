import {randomUUID} from 'node:crypto'

import {agentActionsClient, contentClient, engine} from './clients'
import {type DraftContext, fieldValue, findApproval, loadContext, programSubject} from './context'
import {DRAFT_INSTRUCTION, REDRAFT_INSTRUCTION, RETRY_SUFFIX} from './prompts'
import {type Proposal, type Rejection, validateProposal} from './validate'

function formatRules(context: DraftContext, side: 'bride' | 'groom') {
  const family = context.families.find((f) => f.side === side)
  if (!family) return 'None recorded.'
  const rules = family.rules.map((r, i) => `${i + 1}. ${r.requirement}${r.reason ? ` (Why: ${r.reason})` : ''}`).join('\n')
  return family.notes ? `${rules}\nPreferences, not rules: ${family.notes}` : rules
}

function instructionParams(context: DraftContext, rejection: Rejection | undefined) {
  const event = `${context.event.title}. ${context.event.date} at ${context.event.venue ?? 'the venue'}, ${context.event.city}.`
  const owners = context.owners
    .map((o) => `${o.key}: ${o.name}, ${o.role}${o.business ? `, ${o.business}` : ''}, side: ${o.side}`)
    .join('\n')
  const params: Record<string, string> = {
    brief: context.program.brief,
    event,
    brideRules: formatRules(context, 'bride'),
    groomRules: formatRules(context, 'groom'),
    owners,
  }
  if (rejection) {
    const who = rejection.side === 'coordinator' ? 'The coordinator reopened it' : `The ${rejection.side}'s family rejected it`
    params.rejection = `${who}${rejection.onBehalfOf ? ` (${rejection.onBehalfOf})` : ''}. Reason: "${rejection.reason}"`
    params.currentDraft = JSON.stringify(context.currentItems, null, 2)
  }
  return params
}

async function propose(context: DraftContext, rejection: Rejection | undefined, log: (line: string) => void): Promise<Proposal> {
  const base = rejection ? REDRAFT_INSTRUCTION : DRAFT_INSTRUCTION
  const params = instructionParams(context, rejection)
  const ownerKeys = new Set(context.owners.map((o) => o.key))

  let problems: string[] = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    const instruction = problems.length ? base + RETRY_SUFFIX : base
    const response = await agentActionsClient.agent.action.prompt({
      instruction,
      instructionParams: problems.length ? {...params, problems: problems.map((p) => `- ${p}`).join('\n')} : params,
      format: 'json',
      temperature: 0.2,
    })
    const result = validateProposal(response, ownerKeys)
    if (result.proposal) {
      log(`Prompt attempt ${attempt}: accepted (${result.proposal.items.length} segments).`)
      return result.proposal
    }
    problems = result.problems
    log(`Prompt attempt ${attempt}: rejected by validator:\n  ${problems.join('\n  ')}`)
  }
  throw new Error(`The agent could not produce a valid program after 3 attempts:\n${problems.join('\n')}`)
}

/** Write the proposal as new program items and point the program at them, in one transaction. */
async function writeProposal(context: DraftContext, proposal: Proposal) {
  const ownerByKey = new Map(context.owners.map((o) => [o.key, o.id]))
  const tx = contentClient.transaction()
  const refs = proposal.items.map((item) => {
    const _id = randomUUID()
    const owner = item.ownerKey ? ownerByKey.get(item.ownerKey) : undefined
    tx.create({
      _id,
      _type: 'programItem',
      title: item.title.trim(),
      plannedStart: new Date(`${context.event.date}T${item.start}:00+01:00`).toISOString(),
      plannedDuration: item.durationMinutes,
      sideOfInterest: item.sideOfInterest,
      ...(owner ? {owner: {_type: 'reference', _ref: owner}} : {}),
      ...(item.notes?.trim() ? {notes: item.notes.trim()} : {}),
    })
    return {_type: 'reference' as const, _ref: _id, _key: _id.slice(0, 12)}
  })
  const version = context.program.version + 1
  tx.patch(context.program._id, (patch) => patch.set({items: refs, version}))
  // The previous draft's items belonged only to this program; remove them in the same transaction.
  for (const id of context.program.itemIds) tx.delete(id)
  await tx.commit()
  return version
}

/**
 * Run the redraft prompt against a hypothetical rejection and return the proposal, writing nothing
 * and firing nothing. Lets a person see how the agent would respond before any family rejects.
 */
export async function previewRedraft(reason: string, side = 'groom', log: (line: string) => void = console.log) {
  const context = await loadContext()
  if (context.currentItems.length === 0) throw new Error('There is no draft to redraft yet. Run `pnpm agent draft` first.')
  return propose(context, {side, reason, onBehalfOf: '(preview)'}, log)
}

export type DraftResult = {instanceId: string; stage: string; version: number; summary: string}

/** Draft (or redraft after a rejection) and submit through the workflow, as the agent. */
export async function draftAndSubmit(log: (line: string) => void = console.log): Promise<DraftResult> {
  const context = await loadContext()

  let instance = await findApproval(context.program._id)
  if (!instance) {
    log('No approval running for this program. Starting one as the agent.')
    const started = await engine.startInstance({
      definition: 'program-approval',
      initialFields: [{type: 'subject', name: 'subject', value: programSubject(context.program._id)}],
    })
    instance = started.instance
  }
  if (instance.currentStage !== 'drafting') {
    throw new Error(`Nothing to draft: the program is in "${instance.currentStage}", not "drafting".`)
  }

  const rejection = fieldValue<Rejection | null>(instance, 'lastRejection') ?? undefined
  const redrafting = rejection !== undefined && context.currentItems.length > 0
  log(redrafting ? `Redrafting version ${context.program.version} against: "${rejection.reason}"` : 'Drafting from the couple’s brief and both families’ non-negotiables.')

  const proposal = await propose(context, redrafting ? rejection : undefined, log)
  const version = await writeProposal(context, proposal)
  log(`Wrote version ${version}: ${proposal.items.length} segments.`)

  const note = `Version ${version}. ${proposal.summary}`.slice(0, 2000)
  const result = await engine.fireAction({
    instanceId: instance._id,
    activity: 'draft',
    action: 'submit',
    params: {note},
  })
  log(`Submitted through "submit". The program is now in "${result.instance.currentStage}".`)
  return {instanceId: instance._id, stage: result.instance.currentStage, version, summary: proposal.summary}
}
