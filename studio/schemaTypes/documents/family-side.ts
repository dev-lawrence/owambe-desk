import {UserGroupIcon} from '@hugeicons/core-free-icons'
import {FAMILY_SIDES} from '@owambe/shared'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'
import {list} from '../../lib/options'

export const familySide = defineType({
  name: 'familySide',
  title: 'Family side',
  type: 'document',
  icon: hugeicon(UserGroupIcon),
  description:
    "One family's standing in the event: who speaks for them and what they will not compromise on. The program cannot be printed until both families approve it.",
  fields: [
    defineField({
      name: 'event',
      title: 'Event',
      type: 'reference',
      to: [{type: 'event'}],
      description: 'The event this family is part of.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'side',
      title: 'Side',
      type: 'string',
      description: "The bride's family or the groom's family. Each event has exactly one of each.",
      options: {list: list(FAMILY_SIDES), layout: 'radio', direction: 'horizontal'},
      validation: (rule) =>
        rule.required().custom(async (side, context) => {
          const eventRef = (context.document?.event as {_ref?: string} | undefined)?._ref
          if (!side || !eventRef) return true
          const id = context.document?._id.replace(/^drafts\./, '')
          const count = await context
            .getClient({apiVersion: '2026-09-24'})
            .fetch<number>(
              'count(*[_type == "familySide" && event._ref == $eventRef && side == $side && !(_id in [$id, "drafts." + $id])])',
              {eventRef, side, id},
            )
          return count === 0 || 'This event already has that family side'
        }),
    }),
    defineField({
      name: 'approvers',
      title: 'Approvers',
      type: 'array',
      description:
        'The people who can approve the program on behalf of this family, usually parents or elders. Only people from this side can be picked. The agent can never approve.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'person'}],
          options: {
            filter: ({document}) => ({
              filter: 'side == $side && role in ["parent", "elder"]',
              params: {side: document.side},
            }),
          },
        }),
      ],
      validation: (rule) => rule.required().min(1).unique(),
    }),
    defineField({
      name: 'nonNegotiables',
      title: 'Non-negotiables',
      type: 'array',
      description:
        'What this family will not compromise on. The agent reads these when it drafts the program, and redrafts against them when a family rejects it.',
      of: [defineArrayMember({type: 'nonNegotiable'})],
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 3,
      description: 'Context that is not a hard rule: sensitivities, who to call first, preferences. The agent reads this as a preference, not a rule.',
    }),
  ],
  preview: {
    select: {side: 'side', event: 'event.title', a0: 'approvers.0.name', a1: 'approvers.1.name'},
    prepare: ({side, event, a0, a1}) => ({
      title: FAMILY_SIDES.find((s) => s.value === side)?.title ?? 'Family side',
      subtitle: [event, [a0, a1].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    }),
  },
})
