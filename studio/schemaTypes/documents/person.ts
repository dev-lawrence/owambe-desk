import {UserIcon} from '@hugeicons/core-free-icons'
import {PERSON_ROLES, PERSON_SIDES} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'
import {list} from '../../lib/options'

export const person = defineType({
  name: 'person',
  title: 'Person',
  type: 'document',
  icon: hugeicon(UserIcon),
  description:
    'Anyone involved in the event: celebrants, family, coordinators, vendor contacts, guests. One document per human, referenced everywhere else.',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Name as it should appear on the program and at the gate, including titles like Chief or Dr where the person uses them.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
      description:
        'Optional. International format (+234...). Coordinators call people on the day; WhatsApp is how most of this planning really happens.',
      validation: (rule) => rule.regex(/^\+\d{10,15}$/, {name: 'international phone number'}),
    }),
    defineField({
      name: 'side',
      title: 'Side',
      type: 'string',
      description:
        'Whose people they are. It decides which family can make them an approver and where they are seated.',
      options: {list: list(PERSON_SIDES), layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'role',
      title: 'Role at the event',
      type: 'string',
      description:
        'What they do on the day. Filters who can be picked as an approver (parents, elders), a program owner or a vendor contact.',
      options: {list: list(PERSON_ROLES)},
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {title: 'name', side: 'side', role: 'role'},
    prepare: ({title, side, role}) => ({
      title,
      subtitle: [PERSON_ROLES.find((r) => r.value === role)?.title, PERSON_SIDES.find((s) => s.value === side)?.title]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})
