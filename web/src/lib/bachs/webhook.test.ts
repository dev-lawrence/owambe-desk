import {describe, expect, test, vi} from 'vitest'

import {type BachsEvent, handleBachsEvent, type OrderFacts, type WebhookDeps} from './webhook'

function world(overrides: Partial<OrderFacts> = {}, stage = 'awaiting-payment') {
  const order: OrderFacts = {
    _id: 'order-1',
    _rev: 'rev-1',
    amount: {amount: '90000.00', currency: 'NGN'},
    bachsCheckoutSessionId: 'chk_current',
    bachsPaymentId: null,
    ...overrides,
  }
  const state = {stage}
  const deps: WebhookDeps = {
    findOrder: vi.fn(async (id: string) => (id === order._id ? order : null)),
    findOrderByCheckout: vi.fn(async (id: string) => (id === order.bachsCheckoutSessionId ? order : null)),
    recordPayment: vi.fn(async (_o, payment) => {
      order.bachsPaymentId = payment.paymentId
    }),
    workflowStage: vi.fn(async () => ({instanceId: 'wf-1', stage: state.stage})),
    confirmPayment: vi.fn(async () => (state.stage = 'paid')),
    failPayment: vi.fn(async () => (state.stage = 'ordered')),
  }
  return {deps, order, state}
}

const succeeded = (data: Partial<BachsEvent['data']> = {}, id = 'evt_ok'): BachsEvent => ({
  id,
  type: 'collection.succeeded',
  created_at: '2026-10-01T09:05:00Z',
  data: {charge_id: 'ch_1', checkout_id: 'chk_current', status: 'SUCCEEDED', amount: '90000.00', currency: 'NGN', metadata: {orderId: 'order-1'}, ...data},
})

describe('collection.succeeded', () => {
  test('records the payment on the order, then confirms it through the workflow', async () => {
    const {deps} = world()
    await expect(handleBachsEvent(succeeded(), deps)).resolves.toEqual({result: 'paid', orderId: 'order-1', stage: 'paid'})
    expect(deps.recordPayment).toHaveBeenCalledWith(expect.objectContaining({_id: 'order-1'}), {paymentId: 'ch_1', paidAt: '2026-10-01T09:05:00Z'})
    expect(deps.confirmPayment).toHaveBeenCalledWith('wf-1', {paymentId: 'ch_1', eventId: 'evt_ok', amount: '90000.00', currency: 'NGN'}, 'bachs:evt_ok')
  })

  test('a redelivered event does not record or confirm twice', async () => {
    const {deps} = world()
    await handleBachsEvent(succeeded(), deps)
    await expect(handleBachsEvent(succeeded(), deps)).resolves.toMatchObject({result: 'duplicate'})
    expect(deps.recordPayment).toHaveBeenCalledTimes(1)
    expect(deps.confirmPayment).toHaveBeenCalledTimes(1)
  })

  test('a wrong amount is not treated as paid', async () => {
    const {deps} = world()
    await expect(handleBachsEvent(succeeded({amount: '100.00'}), deps)).resolves.toMatchObject({result: 'needs-review'})
    expect(deps.recordPayment).not.toHaveBeenCalled()
    expect(deps.confirmPayment).not.toHaveBeenCalled()
  })

  test('a wrong currency is not treated as paid', async () => {
    const {deps} = world()
    await expect(handleBachsEvent(succeeded({currency: 'USD'}), deps)).resolves.toMatchObject({result: 'needs-review'})
    expect(deps.confirmPayment).not.toHaveBeenCalled()
  })

  test('an accepted-but-not-exact payment waits for the coordinator', async () => {
    const {deps} = world()
    await expect(handleBachsEvent(succeeded({status: 'ACCEPTED'}), deps)).resolves.toMatchObject({result: 'needs-review'})
    expect(deps.confirmPayment).not.toHaveBeenCalled()
  })

  test('an overpayment for the right order is paid, checked against the expected amount', async () => {
    const {deps} = world()
    await expect(handleBachsEvent(succeeded({status: 'OVERPAID', amount: '95000.00', expected_amount: '90000.00'}), deps)).resolves.toMatchObject({result: 'paid'})
  })

  test('a payment with no charge id (a test event) is not recorded', async () => {
    const {deps} = world()
    await expect(handleBachsEvent(succeeded({charge_id: null}), deps)).resolves.toMatchObject({result: 'needs-review'})
    expect(deps.recordPayment).not.toHaveBeenCalled()
  })

  test('a second, different payment for a paid order is flagged, not applied', async () => {
    const {deps} = world({bachsPaymentId: 'ch_first'}, 'paid')
    await expect(handleBachsEvent(succeeded({charge_id: 'ch_second'}), deps)).resolves.toMatchObject({result: 'needs-review'})
    expect(deps.recordPayment).not.toHaveBeenCalled()
  })

  test('a payment for an unknown order is ignored', async () => {
    const {deps} = world()
    await expect(handleBachsEvent(succeeded({metadata: {orderId: 'someone-else'}}), deps)).resolves.toMatchObject({result: 'ignored'})
  })
})

describe('failures and expiry', () => {
  test('a failed charge for the current checkout returns the order to ordered', async () => {
    const {deps} = world()
    const event: BachsEvent = {id: 'evt_f', type: 'collection.failed', created_at: 'x', data: {checkout_id: 'chk_current', status: 'FAILED', reason: 'Card declined', metadata: {orderId: 'order-1'}}}
    await expect(handleBachsEvent(event, deps)).resolves.toEqual({result: 'failed', orderId: 'order-1', stage: 'ordered'})
    expect(deps.failPayment).toHaveBeenCalledWith('wf-1', {reason: 'Card declined', eventId: 'evt_f'}, 'bachs:evt_f')
  })

  test('an expired checkout returns the order to ordered with a reason', async () => {
    const {deps} = world()
    const event: BachsEvent = {id: 'evt_e', type: 'checkout.expired', created_at: 'x', data: {checkout_id: 'chk_current', metadata: {orderId: 'order-1'}}}
    await handleBachsEvent(event, deps)
    expect(deps.failPayment).toHaveBeenCalledWith('wf-1', {reason: 'The checkout expired before the guest paid', eventId: 'evt_e'}, 'bachs:evt_e')
  })

  test('a late failure for an older checkout does not undo a newer attempt', async () => {
    const {deps} = world()
    const event: BachsEvent = {id: 'evt_old', type: 'checkout.expired', created_at: 'x', data: {checkout_id: 'chk_old', metadata: {orderId: 'order-1'}}}
    await expect(handleBachsEvent(event, deps)).resolves.toMatchObject({result: 'ignored'})
    expect(deps.failPayment).not.toHaveBeenCalled()
  })
})
