import {Clock01Icon} from '@hugeicons/core-free-icons'
import {SIDES_OF_INTEREST} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'
import {list} from '../../lib/options'

export const programItem = defineType({
  name: 'programItem',
  title: 'Program item',
  type: 'document',
  icon: hugeicon(Clock01Icon),
  description:
    'One segment of the day. Its position comes from the program that lists it, not from a number on the item, so reordering is a single edit.',
  groups: [
    {name: 'plan', title: 'Plan', default: true},
    {name: 'live', title: 'On the day'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'plan',
      description: 'What the MC will announce, for example "Breaking of kola nut".',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'plannedStart',
      title: 'Planned start',
      type: 'datetime',
      group: 'plan',
      description: 'When it is meant to start. The live view measures drift against this.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'plannedDuration',
      title: 'Planned duration (minutes)',
      type: 'number',
      group: 'plan',
      description:
        'How long it should take. Stored as a duration, not an end time, so moving the start moves the end with it.',
      validation: (rule) => rule.required().integer().min(1).max(240),
    }),
    defineField({
      name: 'owner',
      title: 'Owner',
      type: 'reference',
      to: [{type: 'person'}],
      group: 'plan',
      description: 'The one person the coordinator calls if this segment is not ready: an MC, an elder, a vendor contact.',
    }),
    defineField({
      name: 'sideOfInterest',
      title: 'Side of interest',
      type: 'string',
      group: 'plan',
      description:
        'Whose tradition or stake this segment carries. The agent protects these when trimming, and the right family is told if it moves.',
      options: {list: list(SIDES_OF_INTEREST), layout: 'radio', direction: 'horizontal'},
      initialValue: 'both',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 3,
      group: 'plan',
      description: 'Cues for the MC, DJ or band: music, who stands where, what must be ready.',
    }),
    defineField({
      name: 'actualStart',
      title: 'Actual start',
      type: 'datetime',
      group: 'live',
      description: 'Filled live from the coordinator console when the segment starts.',
    }),
    defineField({
      name: 'actualEnd',
      title: 'Actual end',
      type: 'datetime',
      group: 'live',
      description: 'Filled live when the segment ends. With the actual start, this gives the drift for the rest of the day.',
      validation: (rule) =>
        rule.custom((end, context) => {
          const start = context.document?.actualStart as string | undefined
          if (!end) return true
          if (!start) return 'Cannot end a segment that has not started'
          return new Date(end) >= new Date(start) || 'Actual end must be after actual start'
        }),
    }),
  ],
  preview: {
    select: {title: 'title', start: 'plannedStart', duration: 'plannedDuration', actualStart: 'actualStart', actualEnd: 'actualEnd'},
    prepare: ({title, start, duration, actualStart, actualEnd}) => {
      const time = start
        ? new Intl.DateTimeFormat('en-NG', {hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos'}).format(new Date(start))
        : '--:--'
      const state = actualEnd ? 'done' : actualStart ? 'running' : ''
      return {title, subtitle: [time, duration ? `${duration} min` : null, state].filter(Boolean).join(' · ')}
    },
  },
})
