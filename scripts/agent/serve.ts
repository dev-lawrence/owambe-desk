// The agent's effect runtime. The Workflows engine is a library: it queues effects (like
// "the agent writes a proposal") and something has to run them. This is that something:
// it watches workflow instances in the dataset, and whenever an effect it owns is waiting,
// it drains it as the agent.
//
//   pnpm agent serve   keep running, react to new work within a second or two
//   pnpm agent drain   one pass over waiting work, then exit
import {createEngine, errorMessage, sweepStaleClaims} from '@sanity/workflow-engine'

import {adjustmentHandlers} from './adjust'
import {agentActionsClient, contentClient, DATASET, PROJECT_ID, WORKFLOW_TAG} from './clients'

const executionContext = {kind: 'drainer', id: 'owambe-agent'} as const

const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)}  ${line}`)

const runtime = createEngine({
  client: contentClient,
  workflowResource: {type: 'dataset', id: `${PROJECT_ID}.${DATASET}`},
  tag: WORKFLOW_TAG,
  executionContext,
  effects: {
    handlers: adjustmentHandlers({
      log,
      prompt: ({instruction, instructionParams}) =>
        agentActionsClient.agent.action.prompt({instruction, instructionParams, format: 'json', temperature: 0.2}),
    }),
    // Effects owned by another runtime stay pending for it.
    missingHandler: 'skip',
  },
})

const WAITING = `*[_type == "sanity.workflow.instance" && tag == $workflowTag && count(pendingEffects[!defined(claim)]) > 0]._id`
const CLAIMED = `*[_type == "sanity.workflow.instance" && tag == $workflowTag && count(pendingEffects[defined(claim)]) > 0]._id`

const draining = new Set<string>()

async function drain(instanceId: string) {
  if (draining.has(instanceId)) return
  draining.add(instanceId)
  try {
    const result = await runtime.drainEffects({instanceId})
    for (const entry of result.drained) log(`${instanceId}: ${entry.name} done`)
    for (const entry of result.failed) log(`${instanceId}: ${entry.name} failed`)
  } catch (error) {
    log(`${instanceId}: drain failed: ${errorMessage(error)}`)
  } finally {
    draining.delete(instanceId)
  }
}

async function drainWaiting() {
  const ids = await contentClient.fetch<string[]>(WAITING, {workflowTag: WORKFLOW_TAG})
  await Promise.all(ids.map(drain))
  return ids.length
}

/** Release claims left behind by a runtime that stopped mid-handler, so the work runs again. */
async function sweep() {
  const ids = await contentClient.fetch<string[]>(CLAIMED, {workflowTag: WORKFLOW_TAG})
  for (const instanceId of ids) {
    await sweepStaleClaims({client: contentClient, tag: WORKFLOW_TAG, instanceId, executionContext}).catch((error: unknown) =>
      log(`${instanceId}: sweep failed: ${errorMessage(error)}`),
    )
  }
}

export async function drainOnce() {
  await sweep()
  const count = await drainWaiting()
  log(count ? `Drained ${count} instance(s).` : 'Nothing waiting.')
}

export async function serve() {
  await drainOnce()
  log('Listening for work. Ctrl+C to stop.')

  let timer: ReturnType<typeof setTimeout> | undefined
  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void drainWaiting().catch((error: unknown) => log(`poll failed: ${errorMessage(error)}`)), 250)
  }
  contentClient
    .listen(`*[_type == "sanity.workflow.instance" && tag == $workflowTag]`, {workflowTag: WORKFLOW_TAG}, {includeResult: false, visibility: 'query'})
    .subscribe({
      next: soon,
      error: (error: unknown) => {
        log(`listener stopped: ${errorMessage(error)}. Restart \`pnpm agent serve\`.`)
        process.exit(1)
      },
    })
  // A backstop in case a listener event is missed, and to recover stale claims.
  setInterval(() => void sweep().then(drainWaiting).catch((error: unknown) => log(`poll failed: ${errorMessage(error)}`)), 30_000)
  await new Promise(() => {})
}
