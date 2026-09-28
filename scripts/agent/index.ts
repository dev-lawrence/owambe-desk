// The Owambe Desk agent. Run from the repo root:
//   pnpm agent draft       draft (or redraft after a rejection) and submit to both families
//   pnpm agent translate   translate the invite into Yoruba, Igbo and Pidgin (unchecked)
//   pnpm agent status      show where the program's approval is, and its history
//   pnpm agent preview-redraft "reason"   show how the agent would redraft; writes nothing
//   pnpm agent serve       run the agent's side of live adjustments (asked for from the console)
//   pnpm agent drain       one pass over waiting live-adjustment work, then exit
import {draftAndSubmit, previewRedraft} from './draft'
import {findApproval, loadContext, watTime} from './context'
import {drainOnce, serve} from './serve'
import {translateInvite} from './translate'

async function status() {
  const context = await loadContext()
  const instance = await findApproval(context.program._id)
  console.log(`Program version ${context.program.version}, ${context.program.itemIds.length} items.`)
  if (!instance) {
    console.log('No approval is running yet. `pnpm agent draft` starts one.')
    return
  }
  console.log(`Approval ${instance._id} is in "${instance.currentStage}".\n`)
  for (const entry of instance.history) {
    const actor = 'actor' in entry && entry.actor ? ` by ${entry.actor.id}` : ''
    const at = `${entry.at.slice(0, 10)} ${watTime(entry.at)}`
    if (entry._type === 'actionFired') console.log(`${at}  ${entry.activity} → ${entry.action}${actor}`)
    if (entry._type === 'transitionFired') console.log(`${at}  moved ${entry.fromStage} → ${entry.toStage}`)
  }
}

const commands: Record<string, () => Promise<unknown>> = {
  draft: () => draftAndSubmit(),
  translate: () => translateInvite({force: process.argv.includes('--force')}),
  status,
  serve,
  drain: drainOnce,
  'preview-redraft': async () => {
    const reason = process.argv[3]
    if (!reason) throw new Error('Usage: pnpm agent preview-redraft "the rejection reason"')
    const proposal = await previewRedraft(reason)
    console.log(`\n${proposal.summary}\n`)
    for (const item of proposal.items) console.log(`${item.start}  ${String(item.durationMinutes).padStart(3)}m  [${item.sideOfInterest}] ${item.title}`)
  },
}

const command = process.argv[2] ?? ''
const run = commands[command]
if (!run) {
  console.error(`Usage: pnpm agent <${Object.keys(commands).join('|')}>`)
  process.exit(1)
}
run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
