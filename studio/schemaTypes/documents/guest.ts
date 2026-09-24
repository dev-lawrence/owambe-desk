import {Ticket01Icon} from '@hugeicons/core-free-icons'
import {INVITE_CODE_PATTERN, RSVP_STATUSES} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'
import {list} from '../../lib/options'

export const guest = defineType({
  name: 'guest',
  title: 'Guest',
  type: 'document',
  icon: hugeicon(Ticket01Icon),
  description:
    'A person’s invitation to one event. Separate from the person, because the same aunt can be invited to many weddings, each with its own table and RSVP.',
  fields: [
    defineField({
      name: 'person',
      title: 'Person',
      type: 'reference',
      to: [{type: 'person'}],
      description: 'Who is invited. Name, phone and side come from the person.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'event',
      title: 'Event',
      type: 'reference',
      to: [{type: 'event'}],
      description: 'The event they are invited to.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'inviteCode',
      title: 'Invite code',
      type: 'string',
      description:
        'Six characters, unique, safe in a URL (/i/code). Letters and digits that look alike (0, o, 1, l, i) are left out so it can be read over the phone.',
      validation: (rule) =>
        rule
          .required()
          .regex(INVITE_CODE_PATTERN, {name: 'invite code'})
          .custom(async (code, context) => {
            if (!code) return true
            const id = context.document?._id.replace(/^drafts\./, '')
            const count = await context
              .getClient({apiVersion: '2026-09-24'})
              .fetch<number>(
                'count(*[_type == "guest" && inviteCode == $code && !(_id in [$id, "drafts." + $id])])',
                {code, id},
              )
            return count === 0 || 'Another guest already has this code'
          }),
    }),
    defineField({
      name: 'seats',
      title: 'Seats',
      type: 'number',
      description:
        'How many people this invite admits, including the guest. "Admits two" is printed on most cards, and the caterer counts plates from this.',
      initialValue: 1,
      validation: (rule) => rule.required().integer().min(1).max(6),
    }),
    defineField({
      name: 'table',
      title: 'Table',
      type: 'string',
      description: 'Table number or name, for example "12" or "High table". Text, because some tables have names.',
    }),
    defineField({
      name: 'rsvp',
      title: 'RSVP',
      type: 'string',
      description: 'The guest’s answer, written from the invite page.',
      options: {list: list(RSVP_STATUSES), layout: 'radio', direction: 'horizontal'},
      initialValue: 'pending',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'checkedInAt',
      title: 'Checked in at',
      type: 'datetime',
      description: 'Set at the gate from the console when the guest arrives. Empty means not arrived yet.',
    }),
  ],
  preview: {
    select: {name: 'person.name', code: 'inviteCode', table: 'table', rsvp: 'rsvp', checkedInAt: 'checkedInAt'},
    prepare: ({name, code, table, rsvp, checkedInAt}) => ({
      title: name ?? 'Guest',
      subtitle: [code, table ? `Table ${table}` : null, checkedInAt ? 'arrived' : rsvp].filter(Boolean).join(' · '),
    }),
  },
})
