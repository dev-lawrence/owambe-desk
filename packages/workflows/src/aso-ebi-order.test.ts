import {ActionDisabledError, type Actor} from '@sanity/workflow-engine'
import {createBench, GuardDeniedError, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, test} from 'vitest'

import {asoEbiOrder} from './aso-ebi-order'

const T0 = '2026-10-01T09:00:00.000Z'

// Ids in the formats the engine resolves (see actors.ts).
const webServer: Actor = {kind: 'person', id: 'g-webserver01', roles: ['editor']}
const paymentWebhook: Actor = {kind: 'person', id: 'g-bachshook01', roles: ['editor']}
const coordinator: Actor = {kind: 'person', id: 'gAdaeze001', roles: ['administrator']}

const order = {
  _id: 'order-1',
  _type: 'asoEbiOrder',
  lot: {_type: 'reference', _ref: 'lot-1'},
  guest: {_type: 'reference', _ref: 'guest-1'},
  quantity: 2,
  amount: {_type: 'money', amount: '90000.00', currency: 'NGN'},
}

async function start() {
  const bench = createBench({now: T0, documents: [order]})
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [asoEbiOrder]})
  const {instance} = await bench.startInstance({
    definition: 'aso-ebi-order',
    initialFields: [subjectField('order-1', {type: 'asoEbiOrder'})],
  })
  return {bench, id: instance._id}
}

async function awaitingPayment(checkoutSessionId = 'chk_first') {
  const ctx = await start()
  await ctx.bench.fireAction({instanceId: ctx.id, activity: 'checkout', action: 'start-checkout', params: {checkoutSessionId}, actor: webServer})
  return ctx
}

const paymentParams = {paymentId: 'ch_123', eventId: 'evt_123', amount: '90000.00', currency: 'NGN'}

/** What the verified webhook does: record the payment facts on the order, then confirm through the workflow. */
async function recordAndConfirm(bench: Awaited<ReturnType<typeof start>>['bench'], id: string) {
  await bench.editDocument({documentId: 'order-1', patch: {set: {bachsPaymentId: 'ch_123', paidAt: '2026-10-01T09:05:00.000Z'}}})
  await bench.fireAction({instanceId: id, activity: 'payment', action: 'confirm-payment', params: paymentParams, actor: paymentWebhook})
}

async function paid() {
  const ctx = await awaitingPayment()
  await recordAndConfirm(ctx.bench, ctx.id)
  return ctx
}

const as = (name: string) => ({onBehalfOf: name})

describe('checkout', () => {
  test('a new order starts in ordered', async () => {
    const {bench, id} = await start()
    expect(await bench.currentStage(id)).toBe('ordered')
  })

  test('the web server opens the checkout; a person cannot fake it', async () => {
    const {bench, id} = await start()
    await expect(
      bench.fireAction({instanceId: id, activity: 'checkout', action: 'start-checkout', params: {checkoutSessionId: 'chk_x'}, actor: coordinator}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
    await bench.fireAction({instanceId: id, activity: 'checkout', action: 'start-checkout', params: {checkoutSessionId: 'chk_x'}, actor: webServer})
    expect(await bench.currentStage(id)).toBe('awaiting-payment')
  })

  test('what is being paid for cannot change while the guest is on the checkout', async () => {
    const {bench} = await awaitingPayment()
    await expect(bench.editDocument({documentId: 'order-1', patch: {set: {quantity: 5}}})).rejects.toThrow(GuardDeniedError)
    await expect(
      bench.editDocument({documentId: 'order-1', patch: {set: {amount: {_type: 'money', amount: '1.00', currency: 'NGN'}}}}),
    ).rejects.toThrow(GuardDeniedError)
  })
})

describe('only the verified webhook can mark an order paid', () => {
  test('no person can confirm a payment, even with payment details', async () => {
    const {bench, id} = await awaitingPayment()
    await bench.editDocument({documentId: 'order-1', patch: {set: {bachsPaymentId: 'ch_123', paidAt: '2026-10-01T09:05:00.000Z'}}})
    const evaluation = await bench.evaluate({instanceId: id, actor: coordinator})
    const confirm = evaluation.currentStage.activities.flatMap((a) => a.actions).find((a) => a.action.name === 'confirm-payment')
    expect(confirm).toMatchObject({allowed: false, disabledReason: {kind: 'filter-failed'}})
    await expect(
      bench.fireAction({instanceId: id, activity: 'payment', action: 'confirm-payment', params: paymentParams, actor: coordinator}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
    expect(await bench.currentStage(id)).toBe('awaiting-payment')
  })

  test('a robot cannot confirm a payment that is not recorded on the order (no verified webhook)', async () => {
    const {bench, id} = await awaitingPayment()
    await expect(
      bench.fireAction({instanceId: id, activity: 'payment', action: 'confirm-payment', params: paymentParams, actor: paymentWebhook}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
    expect(await bench.currentStage(id)).toBe('awaiting-payment')
  })

  test('the webhook confirms a recorded payment and the order is paid', async () => {
    const {bench, id} = await paid()
    expect(await bench.currentStage(id)).toBe('paid')
    const instance = await bench.getInstance({instanceId: id})
    const payment = instance.fields.find((f) => f.name === 'payment')?.value
    expect(payment).toMatchObject({...paymentParams, by: {id: paymentWebhook.id}})
  })
})

describe('failed and expired payments', () => {
  test('a failure needs a reason and returns the order to ordered, reason recorded', async () => {
    const {bench, id} = await awaitingPayment('chk_first')
    await expect(
      bench.fireAction({instanceId: id, activity: 'payment-failure', action: 'payment-failed', params: {eventId: 'evt_9'}, actor: paymentWebhook}),
    ).rejects.toThrow()
    await bench.fireAction({
      instanceId: id,
      activity: 'payment-failure',
      action: 'payment-failed',
      params: {reason: 'Checkout expired before payment', eventId: 'evt_9'},
      actor: paymentWebhook,
    })
    expect(await bench.currentStage(id)).toBe('ordered')
    const instance = await bench.getInstance({instanceId: id})
    expect(instance.fields.find((f) => f.name === 'failedAttempts')?.value).toEqual([
      expect.objectContaining({checkoutSessionId: 'chk_first', reason: 'Checkout expired before payment', eventId: 'evt_9'}),
    ])
  })

  test('a person cannot record a payment failure', async () => {
    const {bench, id} = await awaitingPayment()
    await expect(
      bench.fireAction({
        instanceId: id,
        activity: 'payment-failure',
        action: 'payment-failed',
        params: {reason: 'Guest changed their mind', eventId: 'manual'},
        actor: coordinator,
      }),
    ).rejects.toBeInstanceOf(ActionDisabledError)
  })

  test('after a failure the guest can try again with a new checkout', async () => {
    const {bench, id} = await awaitingPayment('chk_first')
    await bench.fireAction({instanceId: id, activity: 'payment-failure', action: 'payment-failed', params: {reason: 'Card declined', eventId: 'evt_9'}, actor: paymentWebhook})
    await bench.fireAction({instanceId: id, activity: 'checkout', action: 'start-checkout', params: {checkoutSessionId: 'chk_second'}, actor: webServer})
    expect(await bench.currentStage(id)).toBe('awaiting-payment')
    await recordAndConfirm(bench, id)
    expect(await bench.currentStage(id)).toBe('paid')
  })
})

describe('after payment', () => {
  test('the webhook cannot hand the fabric to the tailor; only a person can', async () => {
    const {bench, id} = await paid()
    await expect(
      bench.fireAction({instanceId: id, activity: 'handoff', action: 'send-to-tailor', params: as('Webhook'), actor: paymentWebhook}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
  })

  test('tailor route: with tailor, ready, collected', async () => {
    const {bench, id} = await paid()
    await bench.fireAction({instanceId: id, activity: 'handoff', action: 'send-to-tailor', params: {...as('Adaeze Nwosu'), note: 'Iro and buba'}, actor: coordinator})
    expect(await bench.currentStage(id)).toBe('with-tailor')
    await bench.fireAction({instanceId: id, activity: 'sewing', action: 'mark-ready', params: as('Adaeze Nwosu'), actor: coordinator})
    expect(await bench.currentStage(id)).toBe('ready')
    await bench.fireAction({instanceId: id, activity: 'collection', action: 'mark-collected', params: {...as('Kunle Bakare'), note: 'Collected by her sister'}, actor: coordinator})
    const instance = await bench.getInstance({instanceId: id})
    expect(instance.currentStage).toBe('collected')
    expect(instance.completedAt).toBeDefined()
  })

  test('fabric-only route skips the tailor', async () => {
    const {bench, id} = await paid()
    await bench.fireAction({instanceId: id, activity: 'handoff', action: 'fabric-only', params: as('Adaeze Nwosu'), actor: coordinator})
    expect(await bench.currentStage(id)).toBe('ready')
  })

  test('a paid order keeps its amount, but measurements stay editable for the tailor', async () => {
    const {bench} = await paid()
    await expect(
      bench.editDocument({documentId: 'order-1', patch: {set: {amount: {_type: 'money', amount: '1.00', currency: 'NGN'}}}}),
    ).rejects.toThrow(GuardDeniedError)
    await bench.editDocument({documentId: 'order-1', patch: {set: {measurements: {_type: 'measurements', bust: 96, waist: 80}}}})
  })
})
