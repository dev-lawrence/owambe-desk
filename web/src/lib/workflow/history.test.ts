import {describe, expect, it} from 'vitest'

import {readableHistory, whoCanAct, type HistoryEvent} from './history'

const agent = {id: 'g-agent', kind: 'person'}
const person = {id: 'gHuman', kind: 'person'}
const titles = {stage: (s?: string) => `[${s}]`, action: (_s?: string, _a?: string, action?: string) => `<${action}>`}

describe('readableHistory', () => {
  const history: HistoryEvent[] = [
    {_key: '1', _type: 'actionFired', action: 'submit', activity: 'draft', stage: 'drafting', at: 't1', actor: agent, executionContext: {id: 'owambe-agent'}},
    {_key: '2', _type: 'opApplied', action: 'submit', at: 't1', resolved: {item: {body: 'Version 2.'}}},
    {_key: '3', _type: 'transitionFired', toStage: 'family-review', at: 't2', actor: agent},
    {_key: '4', _type: 'actionFired', action: 'reject', stage: 'family-review', at: 't3', actor: person, executionContext: {kind: 'studio'}},
    {_key: '5', _type: 'opApplied', action: 'reject', at: 't3', resolved: {value: {reason: 'Kola must come first.', onBehalfOf: 'Chief Okafor'}}},
    {_key: '6', _type: 'opApplied', action: 'reject', at: 't3', resolved: {item: {reason: 'Kola must come first.', onBehalfOf: 'Chief Okafor'}}},
  ]
  const steps = readableHistory(history, titles, new Set(['g-agent']))

  it('names the agent and carries its note', () => {
    expect(steps[0]).toMatchObject({who: 'The agent', kind: 'agent', what: '<submit>', detail: 'Version 2.'})
  })
  it('keeps a rejection reason once, with who it was for, and never an account id', () => {
    expect(steps[2]).toMatchObject({who: 'A signed-in person, for Chief Okafor', kind: 'person', detail: 'Kola must come first.'})
    expect(JSON.stringify(steps)).not.toContain('gHuman')
  })
  it('shows transitions as the workflow moving', () => {
    expect(steps[1]).toMatchObject({who: 'The workflow', what: 'Moved to [family-review]'})
  })
})

describe('whoCanAct', () => {
  it('reads the deployed filters', () => {
    expect(whoCanAct('$actor.kind == "person" && string::startsWith($actor.id, "g") && !string::startsWith($actor.id, "g-")')).toBe('People only')
    expect(whoCanAct('(string::startsWith($actor.id, "g-") || string::startsWith($actor.id, "p-"))')).toBe('Server or agent only')
    expect(whoCanAct(undefined)).toBe('Anyone with access')
  })
})
