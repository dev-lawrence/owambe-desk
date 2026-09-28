import 'server-only'

import {findOpenInstance} from '@owambe/workflows'

import {orderSubject, paymentsWebhook} from '@/lib/workflow/engines.server'

import type {OrderFacts, WebhookDeps} from './webhook'

const ORDER_PROJECTION = '{_id, _rev, amount{amount, currency}, bachsCheckoutSessionId, bachsPaymentId}'

/** Everything the webhook touches, as the payment webhook's own identity. */
export function webhookDeps(): WebhookDeps {
  const {client, engine} = paymentsWebhook()
  return {
    findOrder: (orderId) =>
      client.fetch<OrderFacts | null>(`*[_type == "asoEbiOrder" && _id == $orderId][0]${ORDER_PROJECTION}`, {orderId}),
    findOrderByCheckout: (checkoutId) =>
      client.fetch<OrderFacts | null>(
        `*[_type == "asoEbiOrder" && bachsCheckoutSessionId == $checkoutId && !(_id in path("drafts.**"))][0]${ORDER_PROJECTION}`,
        {checkoutId},
      ),
    recordPayment: async (order, {paymentId, paidAt}) => {
      // ifRevisionId: if the order changed since we read it, fail and let Bachs retry the delivery.
      await client.patch(order._id).ifRevisionId(order._rev).set({bachsPaymentId: paymentId, paidAt}).commit()
    },
    workflowStage: async (orderId) => {
      const instance = await findOpenInstance(engine, 'aso-ebi-order', orderSubject(orderId).id)
      return instance ? {instanceId: instance._id, stage: instance.currentStage} : null
    },
    confirmPayment: async (instanceId, params, idempotencyKey) => {
      const result = await engine.fireAction({instanceId, activity: 'payment', action: 'confirm-payment', params, idempotencyKey})
      return result.instance.currentStage
    },
    failPayment: async (instanceId, params, idempotencyKey) => {
      const result = await engine.fireAction({instanceId, activity: 'payment-failure', action: 'payment-failed', params, idempotencyKey})
      return result.instance.currentStage
    },
  }
}
