import {watTime} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

// One segment's timing, before and after a live adjustment. The "before" values are kept so the
// adjustment stays readable after it is applied, and so applying twice is harmless.
export const segmentChange = defineType({
  name: 'segmentChange',
  title: 'Segment change',
  type: 'object',
  fields: [
    defineField({
      name: 'item',
      title: 'Segment',
      type: 'reference',
      to: [{type: 'programItem'}],
      description: 'The program item being moved or shortened.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'fromStart',
      title: 'Planned start before',
      type: 'datetime',
      description: 'The planned start when the agent proposed this. If it has changed since, the adjustment is stale and is not applied.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'fromDuration',
      title: 'Planned minutes before',
      type: 'number',
      description: 'The planned length when the agent proposed this.',
      validation: (rule) => rule.required().integer().min(1),
    }),
    defineField({
      name: 'toStart',
      title: 'New planned start',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'toDuration',
      title: 'New planned minutes',
      type: 'number',
      validation: (rule) => rule.required().integer().min(1),
    }),
  ],
  preview: {
    select: {title: 'item.title', fromStart: 'fromStart', fromDuration: 'fromDuration', toStart: 'toStart', toDuration: 'toDuration'},
    prepare: ({title, fromStart, fromDuration, toStart, toDuration}) => ({
      title: title ?? 'Segment',
      subtitle:
        fromStart && toStart ? `${watTime(fromStart)} (${fromDuration} min) → ${watTime(toStart)} (${toDuration} min)` : undefined,
    }),
  },
})
