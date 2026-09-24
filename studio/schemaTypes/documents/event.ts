import {Calendar03Icon} from '@hugeicons/core-free-icons'
import {EVENT_STATUSES, INVITE_LANGUAGES} from '@owambe/shared'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {hugeicon} from '../../lib/icons'
import {list} from '../../lib/options'

export const event = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  icon: hugeicon(Calendar03Icon),
  groups: [
    {name: 'details', title: 'Details', default: true},
    {name: 'invite', title: 'Invite'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'details',
      description: 'How everyone refers to the day, for example "Tolu & Emeka: Wedding Reception".',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'couple',
      title: 'Couple',
      type: 'array',
      group: 'details',
      description:
        'The two celebrants, as people. References rather than typed names, so the same person can be an approver, appear in the program and receive translations.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'person'}],
          options: {filter: 'role == "celebrant"'},
        }),
      ],
      validation: (rule) => rule.required().length(2).unique(),
    }),
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date',
      group: 'details',
      description:
        'The calendar day of the event. Start times live on the program items. All times are West Africa Time (Africa/Lagos, no daylight saving).',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'venue',
      title: 'Venue',
      type: 'object',
      group: 'details',
      description: 'Where guests go. Kept as its own object because vendors and guests need the address, not just a name.',
      fields: [
        defineField({
          name: 'name',
          title: 'Name',
          type: 'string',
          description: 'The hall or compound name guests will tell a driver.',
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: 'address',
          title: 'Address',
          type: 'string',
          description: 'Street and landmark. In Nigeria a landmark often matters more than a number.',
        }),
      ],
    }),
    defineField({
      name: 'city',
      title: 'City',
      type: 'string',
      group: 'details',
      description: 'City and state, for example "Asaba, Delta State". Out-of-town guests plan travel around it.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'colours',
      title: 'Aso ebi palette',
      type: 'array',
      group: 'details',
      description:
        'The colours of the day. Aso ebi lots must use a colour from this list, and the website takes its accent colour from it.',
      of: [defineArrayMember({type: 'asoEbiColour'})],
      validation: (rule) =>
        rule.min(1).custom((colours) => {
          const names = (colours as {name?: string}[] | undefined)?.map((c) => c.name?.toLowerCase())
          return names && new Set(names).size !== names.length ? 'Colour names must be unique' : true
        }),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      group: 'details',
      description:
        'Where the event is in its life. "Live" switches the public program page to show what is on now and what is next.',
      options: {list: list(EVENT_STATUSES), layout: 'radio'},
      initialValue: 'planning',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'inviteMessage',
      title: 'Invite message (English)',
      type: 'text',
      rows: 6,
      group: 'invite',
      description: 'The source text of the invite. Every translation is made from this.',
    }),
    defineField({
      name: 'inviteTranslations',
      title: 'Translations',
      type: 'array',
      group: 'invite',
      description:
        'The invite in Yoruba, Igbo and Nigerian Pidgin, one entry per language. The agent drafts them; guests only see the ones a person has checked.',
      of: [defineArrayMember({type: 'inviteTranslation'})],
      validation: (rule) =>
        rule.max(INVITE_LANGUAGES.length).custom((items) => {
          const langs = (items as {language?: string}[] | undefined)?.map((i) => i.language)
          return langs && new Set(langs).size !== langs.length ? 'One translation per language' : true
        }),
    }),
  ],
  preview: {
    select: {title: 'title', date: 'date', city: 'city'},
    prepare: ({title, date, city}) => ({title, subtitle: [date, city].filter(Boolean).join(' · ')}),
  },
})
