import {CURRENCIES, DECIMAL_AMOUNT} from '@owambe/shared'
import {defineField, defineType} from 'sanity'

import {list} from '../../lib/options'

export const money = defineType({
  name: 'money',
  title: 'Money',
  type: 'object',
  description:
    'An amount as a decimal string at currency precision, never a float. Bachs takes amounts in this exact format, so nothing gets rounded on the way to the checkout.',
  fields: [
    defineField({
      name: 'amount',
      title: 'Amount',
      type: 'string',
      description: 'Decimal string with two places, for example 45000.00. No commas or ₦ sign.',
      validation: (rule) =>
        rule.required().regex(DECIMAL_AMOUNT, {name: 'decimal amount, e.g. 45000.00'}),
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      description: 'ISO 4217 code. Only Naira for now, but stored so an amount is never ambiguous.',
      initialValue: 'NGN',
      options: {list: list(CURRENCIES)},
      validation: (rule) => rule.required(),
    }),
  ],
  options: {columns: 2},
})
