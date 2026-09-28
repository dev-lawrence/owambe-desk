import {describe, expect, test} from 'vitest'

import {validateProposal} from './validate'

const owners = new Set(['P1', 'P2'])
const item = (start: string, durationMinutes: number, extra: Record<string, unknown> = {}) => ({
  title: 'Segment',
  start,
  durationMinutes,
  sideOfInterest: 'both',
  ownerKey: 'P1',
  notes: null,
  ...extra,
})
const valid = {
  summary: 'Kola comes before food, and the formal program ends before 7:30pm.',
  items: [item('14:00', 60), item('15:00', 15), item('15:15', 15), item('15:30', 30), item('16:00', 60), item('17:00', 60)],
  rulesCheck: [{side: 'groom', requirement: 'Kola before food', howSatisfied: 'Segment 3'}],
}

describe('validateProposal', () => {
  test('accepts a well-formed program', () => {
    expect(validateProposal(valid, owners)).toMatchObject({problems: [], proposal: valid})
  })

  test('rejects overlapping segments', () => {
    const overlapping = {...valid, items: [...valid.items.slice(0, 5), item('16:30', 30)]}
    expect(validateProposal(overlapping, owners).problems.join()).toMatch(/before the previous segment ends/)
  })

  test('rejects owners the agent was not given', () => {
    const invented = {...valid, items: [...valid.items.slice(0, 5), item('17:00', 30, {ownerKey: 'P99'})]}
    expect(validateProposal(invented, owners).problems.join()).toMatch(/not one of the listed people/)
  })

  test('rejects a program that runs past 10pm', () => {
    const late = {...valid, items: [...valid.items.slice(0, 5), item('21:30', 45)]}
    expect(validateProposal(late, owners).problems.join()).toMatch(/22:00/)
  })

  test('rejects bad times, sides and shapes', () => {
    expect(validateProposal({...valid, items: [...valid.items.slice(0, 5), item('7pm', 30)]}, owners).problems.join()).toMatch(/HH:MM/)
    expect(validateProposal({...valid, items: [...valid.items.slice(0, 5), item('17:00', 30, {sideOfInterest: 'yoruba'})]}, owners).problems.join()).toMatch(/sideOfInterest/)
    expect(validateProposal('not json', owners).problems).toHaveLength(1)
    expect(validateProposal({...valid, items: valid.items.slice(0, 2)}, owners).problems.join()).toMatch(/6 to 24/)
  })
})
