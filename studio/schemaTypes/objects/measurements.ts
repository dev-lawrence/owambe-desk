import {defineField, defineType} from 'sanity'

const cm = (name: string, title: string, description: string) =>
  defineField({
    name,
    title,
    type: 'number',
    description,
    validation: (rule) => rule.min(20).max(250).precision(1),
  })

export const measurements = defineType({
  name: 'measurements',
  title: 'Measurements',
  type: 'object',
  description:
    'Optional. Some guests sew with their own tailor; others want the event tailor to sew for them. The tailor needs these before cutting.',
  options: {collapsible: true, collapsed: true, columns: 2},
  fields: [
    cm('bust', 'Bust / chest (cm)', 'Fullest part of the chest.'),
    cm('waist', 'Waist (cm)', 'Natural waist.'),
    cm('hips', 'Hips (cm)', 'Fullest part of the hips.'),
    cm('length', 'Length (cm)', 'Shoulder to hem, for the style the guest wants.'),
    defineField({
      name: 'style',
      title: 'Style notes',
      type: 'text',
      rows: 2,
      description: 'Style the guest wants sewn, for example "iro and buba, puff sleeves" or "senator, long sleeve".',
    }),
  ],
})
