import {createClient} from '@sanity/client'
import {createEngine} from '@sanity/workflow-engine'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. See scripts/.env.example.`)
  return value
}

export const PROJECT_ID = env('SANITY_PROJECT_ID')
export const DATASET = env('SANITY_DATASET')
export const SCHEMA_ID = env('SANITY_SCHEMA_ID')
export const WORKFLOW_TAG = 'owambe'

// Every call the agent makes uses its own robot token, so every content write and every
// workflow move is attributed to the agent, never to a person or the web server.
const token = env('SANITY_AGENT_TOKEN')

export const contentClient = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: env('SANITY_API_VERSION'),
  token,
  useCdn: false,
})

// Agent Actions require the experimental `vX` API version.
export const agentActionsClient = contentClient.withConfig({apiVersion: 'vX'})

export const engine = createEngine({
  client: contentClient,
  workflowResource: {type: 'dataset', id: `${PROJECT_ID}.${DATASET}`},
  tag: WORKFLOW_TAG,
  // Stamped on every history entry the agent causes: "through what" beside the actor's "who".
  executionContext: {kind: 'script', id: 'owambe-agent'},
})
