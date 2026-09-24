import {DressIcon} from '@hugeicons/core-free-icons'
import {FABRIC_TYPES, formatNaira} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'
import {list} from '../../lib/options'

export const asoEbiLot = defineType({
  name: 'asoEbiLot',
  title: 'Aso ebi lot',
  type: 'document',
  icon: hugeicon(DressIcon),
  description: 'One fabric guests can buy, in one colour, at one price.',
  fields: [
    defineField({
      name: 'event',
      title: 'Event',
      type: 'reference',
      to: [{type: 'event'}],
      description: 'The event this fabric is for. The colour is checked against this event’s palette.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'colourName',
      title: 'Colour',
      type: 'string',
      description:
        'Must match a colour name in the event’s aso ebi palette. The palette says which family wears it, so this lot inherits that without a second field to keep in sync.',
      validation: (rule) =>
        rule.required().custom(async (name, context) => {
          const eventRef = (context.document?.event as {_ref?: string} | undefined)?._ref
          if (!name || !eventRef) return true
          const names = await context
            .getClient({apiVersion: '2026-09-24'})
            .fetch<string[] | null>('*[_id == $id][0].colours[].name', {id: eventRef})
          return names?.some((n) => n.toLowerCase() === name.toLowerCase())
            ? true
            : `Not in the event palette. Choose one of: ${(names ?? []).join(', ') || 'no colours set yet'}`
        }),
    }),
    defineField({
      name: 'fabricType',
      title: 'Fabric type',
      type: 'string',
      description: 'Aso-oke, lace, george, ankara or gele. Prices and tailoring time depend on it.',
      options: {list: list(FABRIC_TYPES)},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'unit',
      title: 'What one unit is',
      type: 'string',
      description:
        'What a guest gets for one unit, for example "5 yards + gele". Fabric is sold in bundles, and guests need to know what they are paying for.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'price',
      title: 'Price per unit',
      type: 'money',
      description: 'Decimal string in Naira. The server computes order totals from this, never the browser.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'stock',
      title: 'Units available',
      type: 'number',
      description: 'How many units the family bought from the market. Orders cannot take more than this.',
      validation: (rule) => rule.required().integer().min(0),
    }),
    defineField({
      name: 'tailor',
      title: 'Tailor',
      type: 'reference',
      to: [{type: 'vendor'}],
      description: 'The event tailor who sews this fabric for guests who pay for sewing. Only tailors can be picked.',
      options: {filter: 'category == "tailor"'},
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      description: 'A photo of the actual fabric. Guests buy on sight; a colour name alone is not enough.',
      options: {hotspot: true},
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative text',
          type: 'string',
          description: 'Describe the fabric for people using screen readers, for example "Emerald cord lace with gold beading".',
        }),
      ],
    }),
  ],
  preview: {
    select: {colour: 'colourName', fabric: 'fabricType', amount: 'price.amount', stock: 'stock', media: 'image'},
    prepare: ({colour, fabric, amount, stock, media}) => ({
      title: `${colour ?? ''} ${FABRIC_TYPES.find((f) => f.value === fabric)?.title ?? ''}`.trim(),
      subtitle: [amount ? formatNaira(amount) : null, stock != null ? `${stock} left` : null].filter(Boolean).join(' · '),
      media,
    }),
  },
})
