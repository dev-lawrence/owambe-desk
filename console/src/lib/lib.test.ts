import {asoEbiOrder, liveAdjustment, programApproval} from '@owambe/workflows'
import type {Actor} from '@sanity/workflow-engine'
import {createBench, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, test} from 'vitest'

import {lotTotals, needsReview} from './board'
import {actorLabel, fieldValue, isFinished, stageTitle, subjectId, timeline, waitingOn} from './workflow'

const agent: Actor = {kind: 'person', id: 'g-wR8d7ewDOtYd', roles: ['editor']}
const person: Actor = {kind: 'person', id: 'gX5n5nsYB', roles: ['administrator']}

// Real instance documents, produced by the real definitions on the official test bench.
async function bench() {
  const b = createBench({
    now: '2026-10-01T09:00:00.000Z',
    documents: [
      {_id: 'program-1', _type: 'programOfEvents', items: [{_type: 'reference', _ref: 'item-1', _key: 'a'}]},
      {_id: 'item-1', _type: 'programItem', title: 'Kola'},
      {_id: 'order-1', _type: 'asoEbiOrder', amount: {_type: 'money', amount: '45000.00', currency: 'NGN'}},
    ],
    executionContext: {kind: 'script', id: 'owambe-agent'},
  })
  await b.deployDefinitions({expectedMinReaderModel: 10, definitions: [programApproval, asoEbiOrder, liveAdjustment]})
  return b
}

describe('reading an instance', () => {
  test('stage title, waiting on and the timeline for a program in family review', async () => {
    const b = await bench()
    const {instance} = await b.startInstance({definition: 'program-approval', initialFields: [subjectField('program-1', {type: 'programOfEvents'})], actor: agent})
    expect(waitingOn(instance)).toEqual(['The agent (drafting)'])
    await b.fireAction({instanceId: instance._id, activity: 'draft', action: 'submit', params: {note: 'Version 1.'}, actor: agent})
    await b.fireAction({instanceId: instance._id, activity: 'bride-approval', action: 'approve', params: {onBehalfOf: 'Chief Adebayo Adeyemi'}, actor: person})

    const now = await b.getInstance({instanceId: instance._id})
    expect(stageTitle(now)).toBe('Family review')
    // The bride's side has approved; only the groom's side is still to decide.
    expect(waitingOn(now)).toEqual(['Groom’s family'])
    expect(fieldValue(now, 'brideDecision')).toBe('approved')
    expect(subjectId(now)).toBe('program-1')
    expect(isFinished(now)).toBe(false)

    const rows = timeline(now)
    expect(rows.map((r) => r.text)).toEqual(['Submit to both families', 'Drafting → Family review', 'Approve'])
    expect(rows.map((r) => r.actorId)).toEqual([agent.id, agent.id, person.id])
  })

  test('an order waiting on Bachs, then on the coordinator', async () => {
    const b = await bench()
    const {instance} = await b.startInstance({definition: 'aso-ebi-order', initialFields: [subjectField('order-1', {type: 'asoEbiOrder'})], actor: agent})
    await b.fireAction({instanceId: instance._id, activity: 'checkout', action: 'start-checkout', params: {checkoutSessionId: 'chk_1'}, actor: agent})
    const awaiting = await b.getInstance({instanceId: instance._id})
    // The failure activity is Bachs's too, but there is only one thing to chase.
    expect(waitingOn(awaiting)).toEqual(['Bachs (payment)'])
    expect(stageTitle(awaiting)).toBe('Awaiting payment')
  })
})

describe('actorLabel', () => {
  const ctx = (id: string) => ({runtime: 'node', kind: 'server', id})
  test('names robots by the host they ran in, and people by the directory', () => {
    expect(actorLabel({actor: {id: 'g-a0gl00qSRg0m'}, executionContext: ctx('bachs-webhook')})).toBe('Bachs payment webhook')
    expect(actorLabel({actor: {id: 'g-wR8d7ewDOtYd'}, executionContext: ctx('owambe-agent')})).toBe('Agent')
    expect(actorLabel({actor: {id: 'p-old'}, executionContext: ctx('something-new')})).toBe('Robot p-old')
    expect(actorLabel({actor: {id: 'gX5n5nsYB'}, executionContext: ctx('owambe-agent')}, 'Lawrence')).toBe('Lawrence')
    expect(actorLabel({actor: {id: 'gX5n5nsYB'}})).toBe('A person')
    expect(actorLabel({executionContext: ctx('owambe-agent')})).toBe('Agent')
  })
})

describe('lotTotals', () => {
  const lot = {
    _id: 'lot-1',
    colourName: 'Emerald',
    fabricType: 'aso-oke',
    price: {amount: '45000.00'},
    stock: 40,
    orders: [
      {quantity: 2, amount: {amount: '90000.00'}, paidAt: '2026-10-01T09:05:00Z'},
      {quantity: 1, amount: {amount: '42000.00'}, paidAt: '2026-10-01T09:06:00Z'},
      {quantity: 3, amount: {amount: '135000.00'}, paidAt: null},
    ],
  }

  test('collected is the sum of what paid orders agreed to pay, not today’s price', () => {
    expect(lotTotals(lot)).toMatchObject({paidUnits: 3, collected: '132000.00', unpaidUnits: 3, remaining: 37, potential: '1800000.00'})
  })

  test('an empty or sold-out lot does not break the board', () => {
    expect(lotTotals({...lot, orders: null, stock: 0})).toMatchObject({paidUnits: 0, collected: '0.00', remaining: 0, potential: null})
  })
})

describe('needsReview', () => {
  test('flags a recorded payment the workflow has not taken', () => {
    const paid = {paidAt: '2026-10-01T09:05:00Z', bachsPaymentId: 'ch_1'}
    expect(needsReview(paid, 'ordered')).toBe(true)
    expect(needsReview(paid, 'paid')).toBe(false)
    expect(needsReview({paidAt: null, bachsPaymentId: null}, 'ordered')).toBe(false)
  })
})
