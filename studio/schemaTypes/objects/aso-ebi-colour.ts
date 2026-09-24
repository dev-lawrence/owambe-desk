import {SIDES_OF_INTEREST} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {list} from '../../lib/options'

export const asoEbiColour = defineType({
  name: 'asoEbiColour',
  title: 'Aso ebi colour',
  type: 'object',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'What guests call it, for example "Emerald". Aso ebi lots refer to a colour by this name.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'hex',
      title: 'Hex',
      type: 'string',
      description: 'Colour code for the invite and website swatches, for example #0F5B46.',
      validation: (rule) => rule.required().regex(/^#[0-9A-Fa-f]{6}$/, {name: 'hex colour'}),
    }),
    defineField({
      name: 'side',
      title: 'Worn by',
      type: 'string',
      description:
        "Each family usually picks its own aso ebi. This records whose colour it is, so a guest on the bride's side is pointed to the right fabric.",
      options: {list: list(SIDES_OF_INTEREST), layout: 'radio', direction: 'horizontal'},
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {title: 'name', hex: 'hex', side: 'side'},
    prepare: ({title, hex, side}) => ({title, subtitle: `${hex ?? ''} · ${side ?? ''}`}),
  },
})
