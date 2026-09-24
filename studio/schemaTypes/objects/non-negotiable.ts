import {defineField, defineType} from 'sanity'

export const nonNegotiable = defineType({
  name: 'nonNegotiable',
  title: 'Non-negotiable',
  type: 'object',
  fields: [
    defineField({
      name: 'requirement',
      title: 'Requirement',
      type: 'string',
      description:
        'One rule the program must respect, stated plainly. The agent reads each one separately when drafting, so keep it to one rule per entry.',
      validation: (rule) => rule.required().max(200),
    }),
    defineField({
      name: 'reason',
      title: 'Why it matters',
      type: 'text',
      rows: 2,
      description:
        'The custom or family reason behind it. It helps the agent (and the other family) make a sensible trade-off when two rules pull against each other.',
    }),
  ],
  preview: {select: {title: 'requirement', subtitle: 'reason'}},
})
