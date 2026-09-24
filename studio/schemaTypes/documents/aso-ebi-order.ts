import {ShoppingBag01Icon} from '@hugeicons/core-free-icons'
import {formatNaira} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'

export const asoEbiOrder = defineType({
  name: 'asoEbiOrder',
  title: 'Aso ebi order',
  type: 'document',
  icon: hugeicon(ShoppingBag01Icon),
  description:
    'A guest’s order for aso ebi. The order workflow runs on this document (ordered, awaiting payment, paid, with tailor, ready, collected); the stage lives in the workflow engine. This document holds the facts: what, who, how much, and the payment references.',
  groups: [
    {name: 'order', title: 'Order', default: true},
    {name: 'payment', title: 'Payment'},
    {name: 'tailoring', title: 'Tailoring'},
  ],
  fields: [
    defineField({
      name: 'lot',
      title: 'Lot',
      type: 'reference',
      to: [{type: 'asoEbiLot'}],
      group: 'order',
      description: 'The fabric being bought.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'guest',
      title: 'Guest',
      type: 'reference',
      to: [{type: 'guest'}],
      group: 'order',
      description: 'Who is buying. Linked to the guest record so the coordinator can find their order at collection.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      group: 'order',
      description: 'Units of the lot. Often more than one: guests buy for a spouse or mother too.',
      initialValue: 1,
      validation: (rule) => rule.required().integer().min(1).max(10),
    }),
    defineField({
      name: 'amount',
      title: 'Amount due',
      type: 'money',
      group: 'order',
      readOnly: true,
      description:
        'Lot price × quantity, computed on the server when the order is placed and kept as it was then. If the lot price changes later, an order already placed keeps its price.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'bachsCheckoutSessionId',
      title: 'Bachs checkout session',
      type: 'string',
      group: 'payment',
      readOnly: true,
      description: 'Set by the server when it creates the hosted checkout. Used to match the webhook back to this order.',
    }),
    defineField({
      name: 'bachsPaymentId',
      title: 'Bachs payment',
      type: 'string',
      group: 'payment',
      readOnly: true,
      description:
        'Set only by the verified Bachs webhook. It is the proof of payment, and makes webhook retries idempotent: a payment already recorded is not applied twice.',
    }),
    defineField({
      name: 'paidAt',
      title: 'Paid at',
      type: 'datetime',
      group: 'payment',
      readOnly: true,
      description:
        'When Bachs confirmed payment, written by the webhook at the same moment the workflow moves to Paid. The public success page watches this field live.',
    }),
    defineField({
      name: 'measurements',
      title: 'Measurements',
      type: 'measurements',
      group: 'tailoring',
    }),
  ],
  preview: {
    select: {guest: 'guest.person.name', colour: 'lot.colourName', qty: 'quantity', amount: 'amount.amount', paidAt: 'paidAt'},
    prepare: ({guest, colour, qty, amount, paidAt}) => ({
      title: `${guest ?? 'Guest'}: ${qty ?? 1} × ${colour ?? 'lot'}`,
      subtitle: [amount ? formatNaira(amount) : null, paidAt ? 'paid' : 'unpaid'].filter(Boolean).join(' · '),
    }),
  },
})
