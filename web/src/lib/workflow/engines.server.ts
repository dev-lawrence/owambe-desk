import 'server-only'

import {createClient} from 'next-sanity'
import {createEngine, refDataset} from '@sanity/workflow-engine'

import {dataset, projectId} from '@/sanity/env'

export const WORKFLOW_TAG = 'owambe'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. See web/.env.example.`)
  return value
}

// Each server identity has its own robot token, so workflow history shows exactly who moved what:
// the web server opens checkouts; only the payment webhook confirms or fails payments.
function engineFor(tokenVariable: string, id: string) {
  const client = createClient({projectId, dataset, apiVersion: '2026-09-24', token: required(tokenVariable), useCdn: false})
  const engine = createEngine({
    client,
    workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`},
    tag: WORKFLOW_TAG,
    executionContext: {kind: 'server', id},
  })
  return {client, engine}
}

export const webServer = () => engineFor('SANITY_WEB_SERVER_TOKEN', 'owambe-web')
export const paymentsWebhook = () => engineFor('SANITY_PAYMENTS_WEBHOOK_TOKEN', 'bachs-webhook')

export const orderSubject = (orderId: string) =>
  refDataset({projectId, dataset, documentId: orderId, type: 'asoEbiOrder'})
