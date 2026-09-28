'use server'

import {randomUUID} from 'node:crypto'

import {FABRIC_TYPES, INVITE_CODE_PATTERN, multiply} from '@owambe/shared'
import {findOpenInstance} from '@owambe/workflows'
import {redirect} from 'next/navigation'

import {createCheckoutSession} from '@/lib/bachs/checkout.server'
import {orderSubject, webServer} from '@/lib/workflow/engines.server'

export type OrderFormState = {error?: string}

type Lot = {_id: string; colourName: string; fabricType: string; unit: string; price: {amount: string}; stock: number; paid: number | null}

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/** Create the order, start its workflow, and send the guest to the Bachs hosted checkout. */
export async function placeOrder(_state: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const inviteCode = String(formData.get('inviteCode') ?? '').trim().toLowerCase()
  const lotId = String(formData.get('lotId') ?? '')
  const quantity = Number(formData.get('quantity'))

  if (!INVITE_CODE_PATTERN.test(inviteCode)) return {error: 'That invite code does not look right. It is the six letters and numbers on your invite.'}
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return {error: 'Choose between 1 and 10.'}

  const {client, engine} = webServer()
  const [guest, lot] = await Promise.all([
    client.fetch<{_id: string} | null>('*[_type == "guest" && inviteCode == $inviteCode][0]{_id}', {inviteCode}),
    client.fetch<Lot | null>(
      `*[_type == "asoEbiLot" && _id == $lotId][0]{_id, colourName, fabricType, unit, price, stock,
        "paid": math::sum(*[_type == "asoEbiOrder" && lot._ref == ^._id && defined(paidAt)].quantity)}`,
      {lotId},
    ),
  ])
  if (!guest) return {error: 'We could not find that invite code. Check your invite, or ask the coordinator.'}
  if (!lot) return {error: 'That fabric is no longer available.'}
  // Paid orders use up stock; unpaid ones don't reserve it (see BUILD_LOG, Phase 3).
  const remaining = lot.stock - (lot.paid ?? 0)
  if (quantity > remaining) return {error: remaining > 0 ? `Only ${remaining} left of this fabric.` : 'This fabric is sold out.'}

  // The amount is computed here on the server, in integer kobo, never taken from the browser.
  const amount = multiply(lot.price.amount, quantity)
  const orderId = randomUUID()
  await client.create({
    _id: orderId,
    _type: 'asoEbiOrder',
    lot: {_type: 'reference', _ref: lot._id},
    guest: {_type: 'reference', _ref: guest._id},
    quantity,
    amount: {_type: 'money', amount, currency: 'NGN'},
  })
  await engine.startInstance({
    definition: 'aso-ebi-order',
    initialFields: [{type: 'subject', name: 'subject', value: orderSubject(orderId)}],
  })

  const fabric = FABRIC_TYPES.find((f) => f.value === lot.fabricType)?.title ?? lot.fabricType
  redirect(await checkoutOrFallback(orderId, `${quantity} × ${lot.colourName} ${fabric}`))
}

/** "Pay now" after a failed or expired payment. */
export async function retryCheckout(orderId: string): Promise<void> {
  redirect(await checkoutOrFallback(orderId, 'Aso ebi order'))
}

/**
 * The order is already saved when we ask Bachs for a checkout. If Bachs can't be reached, send the
 * guest to their order page, which says so and offers "Pay now", instead of an error screen.
 */
async function checkoutOrFallback(orderId: string, description: string): Promise<string> {
  try {
    return await openCheckoutFor(orderId, description)
  } catch (error) {
    console.error(`[checkout] could not open a Bachs checkout for ${orderId}`, error)
    return `/aso-ebi/orders/${orderId}?checkout=unavailable`
  }
}

async function openCheckoutFor(orderId: string, description: string): Promise<string> {
  const {client, engine} = webServer()
  const instance = await findOpenInstance(engine, 'aso-ebi-order', orderSubject(orderId).id)
  if (!instance || instance.currentStage !== 'ordered') throw new Error('This order is not waiting for a checkout.')

  const order = await client.fetch<{amount: {amount: string}} | null>('*[_id == $orderId][0]{amount}', {orderId})
  if (!order) throw new Error('Order not found.')
  const failed = instance.fields.find((f) => f.name === 'failedAttempts')?.value
  const attempt = (Array.isArray(failed) ? failed.length : 0) + 1

  const session = await createCheckoutSession({
    orderId,
    attempt,
    amount: order.amount.amount,
    description,
    successUrl: `${siteUrl()}/aso-ebi/orders/${orderId}`,
    cancelUrl: `${siteUrl()}/aso-ebi/orders/${orderId}`,
  })
  // Record the session on the order first: once the workflow is awaiting payment, the order is frozen.
  await client.patch(orderId).set({bachsCheckoutSessionId: session.checkout_id}).commit()
  await engine.fireAction({
    instanceId: instance._id,
    activity: 'checkout',
    action: 'start-checkout',
    params: {checkoutSessionId: session.checkout_id},
    idempotencyKey: `checkout:${session.checkout_id}`,
  })
  return session.checkout_url
}
