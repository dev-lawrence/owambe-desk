import {Store01Icon} from '@hugeicons/core-free-icons'
import {VENDOR_CATEGORIES} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'
import {list} from '../../lib/options'

export const vendor = defineType({
  name: 'vendor',
  title: 'Vendor',
  type: 'document',
  icon: hugeicon(Store01Icon),
  description:
    'A vendor booked for one event. It carries the event, because arrival time is specific to one event.',
  fields: [
    defineField({
      name: 'name',
      title: 'Business name',
      type: 'string',
      description: 'Trading name, as on their invoice or Instagram.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      description: 'What they provide. Aso ebi lots can only be assigned to tailors.',
      options: {list: list(VENDOR_CATEGORIES)},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'contact',
      title: 'Contact person',
      type: 'reference',
      to: [{type: 'person'}],
      description: 'Who the coordinator calls when they are late. A person, so their phone number lives in one place.',
      options: {filter: 'role == "vendorContact"'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'event',
      title: 'Event',
      type: 'reference',
      to: [{type: 'event'}],
      description: 'The event they are booked for.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'arrivedAt',
      title: 'Arrived at',
      type: 'datetime',
      description: 'Set from the console when they arrive at the venue. Caterers and decor who arrive late hold up the whole day.',
    }),
  ],
  preview: {
    select: {title: 'name', category: 'category', contact: 'contact.name', arrivedAt: 'arrivedAt'},
    prepare: ({title, category, contact, arrivedAt}) => ({
      title,
      subtitle: [VENDOR_CATEGORIES.find((c) => c.value === category)?.title, contact, arrivedAt ? 'arrived' : null]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})
