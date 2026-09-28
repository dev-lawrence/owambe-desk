import {TimeManagementIcon} from '@hugeicons/core-free-icons'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'

export const programAdjustment = defineType({
  name: 'programAdjustment',
  title: 'Live adjustment',
  type: 'document',
  icon: hugeicon(TimeManagementIcon),
  description:
    'On the day, when the program runs late, the coordinator asks the agent to re-time and trim what is left. The agent writes its proposal here; the coordinator approves or rejects it through the live-adjustment workflow, and only an approved proposal is applied. The stage (proposing, awaiting the coordinator, applied, rejected) lives in the workflow engine.',
  readOnly: true,
  fields: [
    defineField({
      name: 'program',
      title: 'Program',
      type: 'reference',
      to: [{type: 'programOfEvents'}],
      description: 'The program running late.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'driftMinutes',
      title: 'Drift when asked (minutes)',
      type: 'number',
      description:
        'How late the day was when the coordinator asked, as the console measured it. Kept so the proposal can be judged against the problem it was answering.',
      validation: (rule) => rule.required().integer(),
    }),
    defineField({
      name: 'note',
      title: 'Coordinator’s note',
      type: 'text',
      rows: 2,
      description: 'Anything the agent should know, for example "the MC says the speeches will run long". Optional.',
    }),
    defineField({
      name: 'summary',
      title: 'Agent’s summary',
      type: 'text',
      rows: 4,
      description: 'The agent’s explanation of what it changed and why, written with the proposal.',
    }),
    defineField({
      name: 'changes',
      title: 'Proposed changes',
      type: 'array',
      description:
        'Only segments whose timing changes. Order is never changed: both families approved the running order, so changing it means reopening the program.',
      of: [defineArrayMember({type: 'segmentChange'})],
    }),
    defineField({
      name: 'appliedAt',
      title: 'Applied at',
      type: 'datetime',
      description: 'Written in the same transaction that moved the segments, after the coordinator approved. Empty means never applied.',
    }),
  ],
  preview: {
    select: {drift: 'driftMinutes', changes: 'changes', appliedAt: 'appliedAt', created: '_createdAt'},
    prepare: ({drift, changes, appliedAt}) => ({
      title: `Running ${drift ?? '?'} min late`,
      subtitle: [Array.isArray(changes) ? `${changes.length} segments re-timed` : 'no proposal yet', appliedAt ? 'applied' : null]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})
