// What a verified Bachs event means for an aso ebi order. Signature verification happens before this
// (see signature.ts); this module decides, from the event and the order, whether anything should move.
// Dependencies are passed in so every branch can be tested without a network.

export type BachsEvent = {
  id: string
  type: string
  created_at: string
  data: {
    charge_id?: string | null
    checkout_id?: string | null
    status?: string | null
    amount?: string | null
    currency?: string | null
    expected_amount?: string | null
    reason?: string | null
    metadata?: Record<string, unknown> | null
  }
}

export type OrderFacts = {
  _id: string
  _rev: string
  amount: {amount: string; currency: string} | null
  bachsCheckoutSessionId: string | null
  bachsPaymentId: string | null
}

export type WebhookDeps = {
  findOrder(orderId: string): Promise<OrderFacts | null>
  findOrderByCheckout(checkoutId: string): Promise<OrderFacts | null>
  /** Write bachsPaymentId and paidAt only if the order revision is unchanged. */
  recordPayment(order: OrderFacts, payment: {paymentId: string; paidAt: string}): Promise<void>
  workflowStage(orderId: string): Promise<{instanceId: string; stage: string} | null>
  confirmPayment(instanceId: string, params: {paymentId: string; eventId: string; amount: string; currency: string}, idempotencyKey: string): Promise<string>
  failPayment(instanceId: string, params: {reason: string; eventId: string}, idempotencyKey: string): Promise<string>
}

export type WebhookOutcome =
  | {result: 'paid' | 'failed'; orderId: string; stage: string}
  | {result: 'duplicate' | 'ignored' | 'needs-review'; orderId?: string; message: string}

const PAID_STATUSES = new Set(['SUCCEEDED', 'OVERPAID'])

async function orderFor(event: BachsEvent, deps: WebhookDeps): Promise<OrderFacts | null> {
  const orderId = event.data.metadata?.orderId
  if (typeof orderId === 'string' && orderId) return deps.findOrder(orderId)
  return event.data.checkout_id ? deps.findOrderByCheckout(event.data.checkout_id) : null
}

async function onSucceeded(event: BachsEvent, deps: WebhookDeps): Promise<WebhookOutcome> {
  const {data} = event
  const order = await orderFor(event, deps)
  if (!order) return {result: 'ignored', message: 'No aso ebi order matches this payment'}

  const status = (data.status ?? '').toUpperCase()
  if (!PAID_STATUSES.has(status)) {
    return {result: 'needs-review', orderId: order._id, message: `Bachs reported status ${status || 'unknown'}; not treated as paid`}
  }
  if (!data.charge_id) return {result: 'needs-review', orderId: order._id, message: 'No charge id on the payment; cannot record it'}
  if (!order.amount) return {result: 'needs-review', orderId: order._id, message: 'The order has no amount to compare against'}

  // For an overpayment Bachs reports what was due in expected_amount; otherwise amount is what was due and paid.
  const due = status === 'OVERPAID' ? data.expected_amount : data.amount
  if (due !== order.amount.amount || data.currency !== order.amount.currency) {
    return {
      result: 'needs-review',
      orderId: order._id,
      message: `Paid ${data.amount} ${data.currency} but the order is for ${order.amount.amount} ${order.amount.currency}`,
    }
  }

  if (order.bachsPaymentId && order.bachsPaymentId !== data.charge_id) {
    return {result: 'needs-review', orderId: order._id, message: `Order already paid by ${order.bachsPaymentId}; a second payment ${data.charge_id} arrived`}
  }
  if (!order.bachsPaymentId) {
    await deps.recordPayment(order, {paymentId: data.charge_id, paidAt: event.created_at})
  }

  const workflow = await deps.workflowStage(order._id)
  if (!workflow) return {result: 'needs-review', orderId: order._id, message: 'Payment recorded, but the order has no workflow'}
  if (workflow.stage !== 'awaiting-payment') {
    return workflow.stage === 'ordered'
      ? {result: 'needs-review', orderId: order._id, message: 'Payment arrived after the checkout was marked failed; recorded on the order for the coordinator'}
      : {result: 'duplicate', orderId: order._id, message: `Already past payment (${workflow.stage})`}
  }

  const stage = await deps.confirmPayment(
    workflow.instanceId,
    {paymentId: data.charge_id, eventId: event.id, amount: order.amount.amount, currency: order.amount.currency},
    `bachs:${event.id}`,
  )
  return {result: 'paid', orderId: order._id, stage}
}

async function onFailed(event: BachsEvent, deps: WebhookDeps, fallbackReason: string): Promise<WebhookOutcome> {
  const order = await orderFor(event, deps)
  if (!order) return {result: 'ignored', message: 'No aso ebi order matches this checkout'}
  // A late failure for an older checkout must not undo a newer attempt.
  if (event.data.checkout_id && event.data.checkout_id !== order.bachsCheckoutSessionId) {
    return {result: 'ignored', orderId: order._id, message: 'Event is for an earlier checkout of this order'}
  }
  const workflow = await deps.workflowStage(order._id)
  if (!workflow || workflow.stage !== 'awaiting-payment') {
    return {result: 'duplicate', orderId: order._id, message: `Nothing to fail (${workflow?.stage ?? 'no workflow'})`}
  }
  const reason = (event.data.reason || fallbackReason).slice(0, 500)
  const stage = await deps.failPayment(workflow.instanceId, {reason, eventId: event.id}, `bachs:${event.id}`)
  return {result: 'failed', orderId: order._id, stage}
}

export async function handleBachsEvent(event: BachsEvent, deps: WebhookDeps): Promise<WebhookOutcome> {
  switch (event.type) {
    case 'collection.succeeded':
      return onSucceeded(event, deps)
    case 'collection.failed':
      return onFailed(event, deps, event.data.status === 'EXPIRED' ? 'Nobody paid before the charge closed' : 'Payment failed')
    case 'checkout.expired':
      return onFailed(event, deps, 'The checkout expired before the guest paid')
    default:
      return {result: 'ignored', message: `Event type ${event.type} is not used`}
  }
}

export function isBachsEvent(value: unknown): value is BachsEvent {
  const v = value as Partial<BachsEvent> | null
  return !!v && typeof v.id === 'string' && typeof v.type === 'string' && typeof v.created_at === 'string' && typeof v.data === 'object' && v.data !== null
}
