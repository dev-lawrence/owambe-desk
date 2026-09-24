import {TaskDaily01Icon} from '@hugeicons/core-free-icons'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'

export const programOfEvents = defineType({
  name: 'programOfEvents',
  title: 'Program of events',
  type: 'document',
  icon: hugeicon(TaskDaily01Icon),
  description:
    'The running order both families must agree on. The approval workflow runs on this document; its stage (drafting, family review, ready for print, locked) lives in the workflow engine, not in a field here.',
  fields: [
    defineField({
      name: 'event',
      title: 'Event',
      type: 'reference',
      to: [{type: 'event'}],
      description: 'The event this program is for.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'items',
      title: 'Items',
      type: 'array',
      description: 'The segments in running order. The order of this list is the order of the day.',
      of: [defineArrayMember({type: 'reference', to: [{type: 'programItem'}]})],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'number',
      description:
        'Goes up by one on every draft or redraft, so a family can say "we approved version 3" and everyone knows which one. 0 means the agent has not drafted it yet.',
      initialValue: 0,
      readOnly: true,
      validation: (rule) => rule.required().integer().min(0),
    }),
    defineField({
      name: 'brief',
      title: "Couple's brief",
      type: 'text',
      rows: 8,
      description:
        "What the couple asked for, in their own words. The agent drafts from this plus both families' non-negotiables. Kept on the program so any version can be checked against what was asked.",
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {event: 'event.title', version: 'version', count: 'items'},
    prepare: ({event, version, count}) => ({
      title: event ? `Program: ${event}` : 'Program of events',
      subtitle: `Version ${version ?? 0} · ${Array.isArray(count) ? count.length : 0} items`,
    }),
  },
})
