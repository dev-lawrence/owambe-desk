import {
  defineAction,
  defineActivity,
  defineField,
  defineGuard,
  defineOp,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

import {PEOPLE_ONLY, ROBOTS_ONLY} from './actors'

// What was ordered and what was paid must not change underneath the payment or the tailor.
// Measurements stay editable: the tailor often takes them after payment.
const freezeOrder = (stage: string) =>
  defineGuard({
    name: `freeze-order-${stage}`,
    title: 'Order is fixed',
    description: 'The fabric, quantity, guest and amount cannot change once a checkout exists.',
    match: {idRefs: [{type: 'fieldRead', field: 'subject'}], actions: ['update', 'publish']},
    predicate: '!delta::changedAny((lot, guest, quantity, amount, bachsCheckoutSessionId))',
  })

// After payment the payment facts are fixed too.
const freezePaidOrder = (stage: string) =>
  defineGuard({
    name: `freeze-paid-order-${stage}`,
    title: 'Paid order is fixed',
    description: 'A paid order keeps its fabric, quantity, amount and payment record.',
    match: {idRefs: [{type: 'fieldRead', field: 'subject'}], actions: ['update', 'publish']},
    predicate: '!delta::changedAny((lot, guest, quantity, amount, bachsCheckoutSessionId, bachsPaymentId, paidAt))',
  })

const coordinatorParam = {
  type: 'string',
  name: 'onBehalfOf',
  title: 'Coordinator',
  description: 'The coordinator making this change.',
  required: true,
  validation: {min: 2},
} as const

export const asoEbiOrder = defineWorkflow({
  name: 'aso-ebi-order',
  title: 'Aso ebi order',
  description:
    'A guest orders aso ebi and pays through Bachs. Only the verified payment webhook can mark it paid. The coordinator then hands it to the tailor (or straight to the guest) and records collection.',
  initialStage: 'ordered',
  start: {
    kind: 'autonomous',
    requirements: [{type: 'singleSubject', name: 'one-workflow-per-order', title: 'This order already has a workflow'}],
  },
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Order',
      types: ['asoEbiOrder'],
      initialValue: {type: 'input'},
      required: true,
    }),
    defineField({
      type: 'string',
      name: 'checkoutSessionId',
      title: 'Current Bachs checkout',
      description: 'The checkout session the guest is paying through now. A new one is created after a failed or expired attempt.',
    }),
    defineField({
      type: 'object',
      name: 'payment',
      title: 'Payment',
      description: 'Recorded by the payment webhook after it verified the Bachs signature and matched the amount.',
      fields: [
        {type: 'string', name: 'paymentId'},
        {type: 'string', name: 'eventId'},
        {type: 'string', name: 'amount'},
        {type: 'string', name: 'currency'},
        {type: 'actor', name: 'by'},
        {type: 'datetime', name: 'at'},
      ],
    }),
    defineField({
      type: 'array',
      name: 'failedAttempts',
      title: 'Failed payment attempts',
      description: 'Every checkout that failed or expired, with the reason Bachs gave.',
      of: [
        {
          type: 'object',
          name: 'attempt',
          fields: [
            {type: 'string', name: 'checkoutSessionId'},
            {type: 'string', name: 'reason'},
            {type: 'string', name: 'eventId'},
            {type: 'actor', name: 'by'},
            {type: 'datetime', name: 'at'},
          ],
        },
      ],
    }),
    defineField({
      type: 'array',
      name: 'handoffs',
      title: 'Hand-offs',
      description: 'Who moved the order after payment, and on whose behalf.',
      of: [
        {
          type: 'object',
          name: 'handoff',
          fields: [
            {type: 'string', name: 'step'},
            {type: 'string', name: 'onBehalfOf'},
            {type: 'string', name: 'note'},
            {type: 'actor', name: 'by'},
            {type: 'datetime', name: 'at'},
          ],
        },
      ],
    }),
  ],
  stages: [
    defineStage({
      name: 'ordered',
      title: 'Ordered',
      description: 'The guest has chosen fabric and quantity. A Bachs checkout has not been opened yet, or the last one failed.',
      activities: [
        defineActivity({
          name: 'checkout',
          title: 'Open a Bachs checkout',
          requirements: [
            {type: 'groq', name: 'has-amount', title: 'The order has no amount', query: 'defined($fields.subject.amount.amount)'},
          ],
          actions: [
            defineAction({
              name: 'start-checkout',
              title: 'Checkout opened',
              description: 'Fired by the web server after Bachs created the hosted checkout.',
              filter: ROBOTS_ONLY,
              params: [{type: 'string', name: 'checkoutSessionId', required: true, validation: {min: 5, max: 200}}],
              status: 'done',
              ops: [
                defineOp({
                  type: 'field.set',
                  target: {scope: 'workflow', field: 'checkoutSessionId'},
                  value: {type: 'param', param: 'checkoutSessionId'},
                }),
              ],
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'to-awaiting-payment', title: 'Checkout opened', to: 'awaiting-payment'})],
    }),
    defineStage({
      name: 'awaiting-payment',
      title: 'Awaiting payment',
      description: 'The guest is on the Bachs hosted checkout. Only the verified webhook moves the order from here.',
      guards: [freezeOrder('awaiting-payment')],
      fields: [defineField({type: 'boolean', name: 'attemptFailed'})],
      activities: [
        defineActivity({
          name: 'payment',
          title: 'Wait for Bachs to confirm payment',
          // The webhook writes the payment facts onto the order first; without them there is nothing to confirm.
          requirements: [
            {
              type: 'groq',
              name: 'payment-recorded',
              title: 'No verified payment is recorded on the order',
              query: 'defined($fields.subject.paidAt) && defined($fields.subject.bachsPaymentId)',
            },
          ],
          actions: [
            defineAction({
              name: 'confirm-payment',
              title: 'Payment confirmed by Bachs',
              description: 'Fired only by the payment webhook, after it verified the signature and matched the amount.',
              filter: ROBOTS_ONLY,
              params: [
                {type: 'string', name: 'paymentId', required: true, validation: {min: 3}},
                {type: 'string', name: 'eventId', required: true, validation: {min: 3}},
                {type: 'string', name: 'amount', required: true},
                {type: 'string', name: 'currency', required: true, options: {list: [{title: 'Naira', value: 'NGN'}]}},
              ],
              status: 'done',
              ops: [
                defineOp({
                  type: 'field.set',
                  target: {scope: 'workflow', field: 'payment'},
                  value: {
                    type: 'object',
                    fields: {
                      paymentId: {type: 'param', param: 'paymentId'},
                      eventId: {type: 'param', param: 'eventId'},
                      amount: {type: 'param', param: 'amount'},
                      currency: {type: 'param', param: 'currency'},
                      by: {type: 'actor'},
                      at: {type: 'now'},
                    },
                  },
                }),
              ],
              semantics: ['decision.accept'],
            }),
          ],
        }),
        defineActivity({
          name: 'payment-failure',
          title: 'Record a failed or expired payment',
          actions: [
            defineAction({
              name: 'payment-failed',
              title: 'Payment failed or expired',
              description: 'Fired only by the payment webhook when Bachs reports a failed charge or an expired checkout.',
              filter: ROBOTS_ONLY,
              params: [
                {type: 'string', name: 'reason', required: true, validation: {min: 3, max: 500}},
                {type: 'string', name: 'eventId', required: true, validation: {min: 3}},
              ],
              status: 'done',
              ops: [
                defineOp({
                  type: 'field.append',
                  target: {scope: 'workflow', field: 'failedAttempts'},
                  value: {
                    type: 'object',
                    fields: {
                      checkoutSessionId: {type: 'fieldRead', field: 'checkoutSessionId', scope: 'workflow'},
                      reason: {type: 'param', param: 'reason'},
                      eventId: {type: 'param', param: 'eventId'},
                      by: {type: 'actor'},
                      at: {type: 'now'},
                    },
                  },
                }),
                defineOp({
                  type: 'field.set',
                  target: {scope: 'stage', field: 'attemptFailed'},
                  value: {type: 'literal', value: true},
                }),
              ],
              semantics: ['decision.decline'],
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({name: 'to-paid', title: 'Paid', to: 'paid', when: 'defined($fields.payment.paymentId)'}),
        defineTransition({
          name: 'back-to-ordered',
          title: 'Payment failed: back to ordered',
          to: 'ordered',
          when: '$fields.attemptFailed == true',
        }),
      ],
    }),
    defineStage({
      name: 'paid',
      title: 'Paid',
      description: 'Bachs confirmed payment. The coordinator sends the fabric to the event tailor, or hands it to the guest to sew themselves.',
      guards: [freezePaidOrder('paid')],
      fields: [
        defineField({
          type: 'string',
          name: 'route',
          options: {list: [{title: 'Event tailor', value: 'tailor'}, {title: 'Fabric only', value: 'fabric-only'}]},
        }),
      ],
      activities: [
        defineActivity({
          name: 'handoff',
          title: 'Hand off the fabric',
          actions: [
            defineAction({
              name: 'send-to-tailor',
              title: 'Send to the event tailor',
              filter: PEOPLE_ONLY,
              params: [coordinatorParam, {type: 'string', name: 'note', title: 'Note for the tailor'}],
              status: 'done',
              ops: [
                defineOp({type: 'field.set', target: {scope: 'stage', field: 'route'}, value: {type: 'literal', value: 'tailor'}}),
                handoffRow('sent-to-tailor'),
              ],
            }),
            defineAction({
              name: 'fabric-only',
              title: 'Guest sews with their own tailor',
              filter: PEOPLE_ONLY,
              params: [coordinatorParam, {type: 'string', name: 'note', title: 'Note'}],
              status: 'done',
              ops: [
                defineOp({type: 'field.set', target: {scope: 'stage', field: 'route'}, value: {type: 'literal', value: 'fabric-only'}}),
                handoffRow('fabric-only'),
              ],
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({name: 'to-with-tailor', title: 'With the tailor', to: 'with-tailor', when: '$fields.route == "tailor"'}),
        defineTransition({name: 'to-ready', title: 'Ready for collection', to: 'ready', when: '$fields.route == "fabric-only"'}),
      ],
    }),
    defineStage({
      name: 'with-tailor',
      title: 'With tailor',
      description: 'The event tailor is sewing it.',
      guards: [freezePaidOrder('with-tailor')],
      activities: [
        defineActivity({
          name: 'sewing',
          title: 'Sewing',
          actions: [
            defineAction({
              name: 'mark-ready',
              title: 'Ready for collection',
              filter: PEOPLE_ONLY,
              params: [coordinatorParam, {type: 'string', name: 'note', title: 'Note'}],
              status: 'done',
              ops: [handoffRow('ready')],
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'to-ready', title: 'Ready for collection', to: 'ready'})],
    }),
    defineStage({
      name: 'ready',
      title: 'Ready',
      description: 'Waiting for the guest (or someone they send) to collect it.',
      guards: [freezePaidOrder('ready')],
      activities: [
        defineActivity({
          name: 'collection',
          title: 'Collection',
          actions: [
            defineAction({
              name: 'mark-collected',
              title: 'Collected',
              filter: PEOPLE_ONLY,
              params: [coordinatorParam, {type: 'string', name: 'note', title: 'Collected by', required: true, validation: {min: 2}}],
              status: 'done',
              ops: [handoffRow('collected')],
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'to-collected', title: 'Collected', to: 'collected'})],
    }),
    defineStage({name: 'collected', title: 'Collected', description: 'The guest has their aso ebi.'}),
  ],
})

function handoffRow(step: string) {
  return defineOp({
    type: 'field.append',
    target: {scope: 'workflow', field: 'handoffs'},
    value: {
      type: 'object',
      fields: {
        step: {type: 'literal', value: step},
        onBehalfOf: {type: 'param', param: 'onBehalfOf'},
        note: {type: 'param', param: 'note'},
        by: {type: 'actor'},
        at: {type: 'now'},
      },
    },
  })
}
