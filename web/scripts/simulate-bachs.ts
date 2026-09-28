// Local stand-in for Bachs, until a sandbox account is connected. It uses the REAL route, signature
// check, workflow engine and dataset; only Bachs itself is simulated. Every simulated id is labelled
// "sim" so it can't be mistaken for a real sandbox payment.
//
//   pnpm --filter @owambe/web simulate order [inviteCode]        create an order waiting for payment
//   pnpm --filter @owambe/web simulate pay <orderId>             send a signed collection.succeeded
//   pnpm --filter @owambe/web simulate expire <orderId>          send a signed checkout.expired
//   pnpm --filter @owambe/web simulate forged <orderId>          send an UNSIGNED "payment" (must be refused)
//   pnpm --filter @owambe/web simulate wrong-secret <orderId>    send a payment signed with the wrong secret
import {randomBytes, randomUUID} from 'node:crypto'

import {findOpenInstance} from '@owambe/workflows'
import {createEngine, refDataset} from '@sanity/workflow-engine'
import {createClient} from 'next-sanity'

import {signLikeBachs} from '../src/lib/bachs/signature'

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in web/.env.local`)
  return value
}
const projectId = env('NEXT_PUBLIC_SANITY_PROJECT_ID')
const dataset = env('NEXT_PUBLIC_SANITY_DATASET')
const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// The simulator acts as the web server when creating an order, exactly like the real server action.
const client = createClient({projectId, dataset, apiVersion: '2026-09-24', token: env('SANITY_WEB_SERVER_TOKEN'), useCdn: false})
const engine = createEngine({client, workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`}, tag: 'owambe', executionContext: {kind: 'script', id: 'bachs-simulator'}})
const subject = (orderId: string) => refDataset({projectId, dataset, documentId: orderId, type: 'asoEbiOrder'})
const simId = (prefix: string) => `${prefix}_sim_${randomBytes(8).toString('hex')}`

async function order(inviteCode = 'kzfr2r') {
  const guest = await client.fetch<{_id: string; name: string} | null>('*[_type == "guest" && inviteCode == $inviteCode][0]{_id, "name": person->name}', {inviteCode})
  const lot = await client.fetch<{_id: string; price: {amount: string}; colourName: string} | null>('*[_type == "asoEbiLot"] | order(price.amount asc)[0]{_id, price, colourName}')
  if (!guest || !lot) throw new Error('Seed data missing')
  const orderId = randomUUID()
  await client.create({_id: orderId, _type: 'asoEbiOrder', lot: {_type: 'reference', _ref: lot._id}, guest: {_type: 'reference', _ref: guest._id}, quantity: 1, amount: {_type: 'money', amount: lot.price.amount, currency: 'NGN'}})
  const {instance} = await engine.startInstance({definition: 'aso-ebi-order', initialFields: [{type: 'subject', name: 'subject', value: subject(orderId)}]})
  const checkoutId = simId('chk')
  await client.patch(orderId).set({bachsCheckoutSessionId: checkoutId}).commit()
  const moved = await engine.fireAction({instanceId: instance._id, activity: 'checkout', action: 'start-checkout', params: {checkoutSessionId: checkoutId}})
  console.log(`Order ${orderId} for ${guest.name}: 1 × ${lot.colourName}, ₦${lot.price.amount}. Stage: ${moved.instance.currentStage}`)
  console.log(`Open ${site}/aso-ebi/orders/${orderId} and leave it open.`)
}

async function send(kind: 'pay' | 'expire' | 'forged' | 'wrong-secret', orderId: string) {
  const facts = await client.fetch<{amount: {amount: string}; bachsCheckoutSessionId: string} | null>('*[_id == $orderId][0]{amount, bachsCheckoutSessionId}', {orderId})
  if (!facts) throw new Error(`No order ${orderId}`)
  const event =
    kind === 'expire'
      ? {id: simId('evt'), type: 'checkout.expired', created_at: new Date().toISOString(), data: {checkout_id: facts.bachsCheckoutSessionId, status: 'expired', metadata: {orderId}}}
      : {
          id: simId('evt'),
          type: 'collection.succeeded',
          created_at: new Date().toISOString(),
          data: {charge_id: simId('ch'), checkout_id: facts.bachsCheckoutSessionId, status: 'SUCCEEDED', amount: facts.amount.amount, currency: 'NGN', metadata: {orderId}},
        }
  const body = JSON.stringify(event)
  const headers: Record<string, string> =
    kind === 'forged' ? {} : signLikeBachs(body, kind === 'wrong-secret' ? 'whsec_not_the_real_one' : env('BACHS_WEBHOOK_SECRET'))
  const response = await fetch(`${site}/api/webhooks/bachs`, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body})
  console.log(`${kind}: ${event.type} ${event.id} → HTTP ${response.status} ${await response.text()}`)
  const instance = await findOpenInstance(engine, 'aso-ebi-order', subject(orderId).id)
  const paid = await client.fetch<string | null>('*[_id == $orderId][0].paidAt', {orderId})
  console.log(`Order now: stage ${instance?.currentStage ?? '(completed)'}, paidAt ${paid ?? '(not set)'}`)
}

const [command, arg] = process.argv.slice(2)
const run =
  command === 'order' ? order(arg) : command && ['pay', 'expire', 'forged', 'wrong-secret'].includes(command) && arg ? send(command as never, arg) : null
if (!run) {
  console.error('Usage: simulate order [inviteCode] | pay|expire|forged|wrong-secret <orderId>')
  process.exit(1)
}
run.catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
