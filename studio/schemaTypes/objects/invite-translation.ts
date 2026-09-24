import {INVITE_LANGUAGES} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {list} from '../../lib/options'

export const inviteTranslation = defineType({
  name: 'inviteTranslation',
  title: 'Invite translation',
  type: 'object',
  fields: [
    defineField({
      name: 'language',
      title: 'Language',
      type: 'string',
      description: 'Language code of this version of the invite message.',
      options: {list: list(INVITE_LANGUAGES)},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'text',
      title: 'Text',
      type: 'text',
      rows: 5,
      description: 'The invite message in this language. The agent drafts it; a fluent person checks it.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'reviewed',
      title: 'Checked by a fluent speaker',
      type: 'boolean',
      description:
        'Machine translation of Yoruba, Igbo and Pidgin can be wrong or disrespectful. Guests only see this translation once a person switches this on.',
      initialValue: false,
    }),
    defineField({
      name: 'reviewedBy',
      title: 'Checked by',
      type: 'reference',
      to: [{type: 'person'}],
      description: 'Who vouched for the translation, so there is someone to ask if a guest raises a concern.',
      hidden: ({parent}) => !parent?.reviewed,
      validation: (rule) =>
        rule.custom((value, context) => {
          const parent = context.parent as {reviewed?: boolean} | undefined
          return parent?.reviewed && !value ? 'Say who checked it' : true
        }),
    }),
  ],
  preview: {
    select: {language: 'language', text: 'text', reviewed: 'reviewed'},
    prepare: ({language, text, reviewed}) => ({
      title: `${language ?? '?'} · ${reviewed ? 'checked' : 'not checked yet'}`,
      subtitle: text,
    }),
  },
})
