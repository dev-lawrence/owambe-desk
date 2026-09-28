import {fromWat} from '@owambe/shared'
import {liveAdjustment} from '@owambe/workflows'
import type {Actor} from '@sanity/workflow-engine'
import {createBench, createBenchEngine, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, test} from 'vitest'

import {adjustmentHandlers, type AdjustmentDoc, buildContext, nearestInstant, planApply, validateAdjustment} from './adjust'

const at = (hhmm: string) => fromWat('2026-12-12', hhmm).toISOString()
const NOW = fromWat('2026-12-12', '15:05')

// Kola ran long, the entrance started late and is on stage, three segments are still to come.
const items = [
  {_id: 'kola', _rev: 'r1', title: 'Breaking of kola nut', plannedStart: at('14:00'), plannedDuration: 30, actualStart: at('14:10'), actualEnd: at('14:45'), sideOfInterest: 'groom', notes: null},
  {_id: 'entrance', _rev: 'r1', title: 'Entrance of the couple', plannedStart: at('14:30'), plannedDuration: 20, actualStart: at('14:48'), actualEnd: null, sideOfInterest: 'both', notes: null},
  {_id: 'speeches', _rev: 'r1', title: 'Speeches', plannedStart: at('14:50'), plannedDuration: 30, actualStart: null, actualEnd: null, sideOfInterest: 'both', notes: null},
  {_id: 'cake', _rev: 'r1', title: 'Cutting of the cake', plannedStart: at('15:20'), plannedDuration: 15, actualStart: null, actualEnd: null, sideOfInterest: 'both', notes: null},
  {_id: 'floor', _rev: 'r1', title: 'Open dance floor', plannedStart: at('15:35'), plannedDuration: 60, actualStart: null, actualEnd: null, sideOfInterest: 'both', notes: null},
]

const doc: AdjustmentDoc = {
  _id: 'adj-1',
  note: 'The MC says the speeches will run long.',
  changes: null,
  appliedAt: null,
  program: {_id: 'program-1', items},
  families: [
    {side: 'bride', rules: [{requirement: 'The Adeyemi prayer comes before the cake', reason: null}]},
    {side: 'groom', rules: [{requirement: 'Kola is broken before any food', reason: 'Oji comes first'}]},
  ],
}

const good = {
  summary: 'Speeches keep their 30 minutes. The open dance floor gives up 18 minutes so the program still ends at 16:35.',
  items: [
    {key: 'S1', start: '15:08', durationMinutes: 30},
    {key: 'S2', start: '15:38', durationMinutes: 15},
    {key: 'S3', start: '15:53', durationMinutes: 42},
  ],
}

const context = () => buildContext(doc, NOW)
const withItems = (changes: Partial<(typeof good.items)[number]>[]) => ({...good, items: good.items.map((item, i) => ({...item, ...changes[i]}))})

describe('buildContext', () => {
  test('measures the drift and the limits the agent works within', () => {
    const c = context()
    expect(c.driftMinutes).toBe(18)
    expect(c.upcoming.map((u) => [u.key, u._id])).toEqual([
      ['S1', 'speeches'],
      ['S2', 'cake'],
      ['S3', 'floor'],
    ])
    // The entrance started 14:48 and is planned for 20 minutes.
    expect(c.earliest.toISOString()).toBe(at('15:08'))
    expect(c.finishBy.toISOString()).toBe(at('16:35'))
    expect(c.params.drift).toBe('18 min late')
    expect(c.params.running).toContain('Entrance of the couple, started 14:48')
    expect(c.params.groomRules).toContain('Kola is broken before any food (Why: Oji comes first)')
    expect(c.params.note).toBe('The MC says the speeches will run long.')
  })
})

describe('validateAdjustment', () => {
  test('accepts a proposal that fits, and lists only the segments that change', () => {
    const result = validateAdjustment(good, context())
    expect(result.problems).toEqual([])
    expect(result.changes).toHaveLength(3)
    expect(result.changes?.[2]).toMatchObject({
      item: {_ref: 'floor'},
      fromStart: at('15:35'),
      fromDuration: 60,
      toStart: at('15:53'),
      toDuration: 42,
    })
  })

  test('refuses to drop, add or reorder segments', () => {
    const reordered = {...good, items: [good.items[1], good.items[0], good.items[2]]}
    expect(validateAdjustment(reordered, context()).problems[0]).toMatch(/every segment still to come, in order/)
    const dropped = {...good, items: good.items.slice(0, 2)}
    expect(validateAdjustment(dropped, context()).problems[0]).toMatch(/S1, S2, S3/)
  })

  test('refuses to lengthen a segment or cut it below half', () => {
    expect(validateAdjustment(withItems([{durationMinutes: 35}]), context()).problems.join()).toMatch(/longer than planned/)
    expect(validateAdjustment(withItems([{}, {}, {durationMinutes: 29}]), context()).problems.join()).toMatch(/below half/)
  })

  test('refuses a start before the running segment can end, or overlapping segments', () => {
    expect(validateAdjustment(withItems([{start: '15:05'}]), context()).problems.join()).toMatch(/before 15:08/)
    expect(validateAdjustment(withItems([{}, {start: '15:30'}]), context()).problems.join()).toMatch(/before the previous segment ends at 15:38/)
  })

  test('refuses to bring a segment forward: people are working to the planned times', () => {
    // The cake moves to 15:28, but the floor is pulled to 15:30, five minutes before its planned 15:35.
    const forward = withItems([{durationMinutes: 20}, {start: '15:28'}, {start: '15:30', durationMinutes: 60}])
    expect(validateAdjustment(forward, context()).problems.join()).toMatch(/earlier than its planned 15:35/)
  })

  test('refuses to cut more than the lateness needs', () => {
    // 18 minutes late: cutting the cake to 8 and the floor to 30 removes 37 minutes.
    const overcut = withItems([{}, {durationMinutes: 8}, {start: '15:46', durationMinutes: 30}])
    expect(context().maxCut).toBe(28)
    expect(validateAdjustment(overcut, context()).problems.join()).toMatch(/cut 37 minutes in total; the program is only 18 minutes late/)
  })

  test('refuses a program that ends later than planned', () => {
    expect(validateAdjustment(withItems([{}, {}, {durationMinutes: 50}]), context()).problems.join()).toMatch(/after 16:35/)
  })

  test('refuses a proposal that changes nothing, or is not the right shape', () => {
    const unchanged = {
      summary: 'Leave everything as it is for now.',
      items: [
        {key: 'S1', start: '14:50', durationMinutes: 30},
        {key: 'S2', start: '15:20', durationMinutes: 15},
        {key: 'S3', start: '15:35', durationMinutes: 60},
      ],
    }
    // 14:50 is before the entrance can end, so an unchanged plan also fails the start rule.
    expect(validateAdjustment(unchanged, context()).problems.length).toBeGreaterThan(0)
    expect(validateAdjustment('not json', context()).problems).toEqual(['The answer is not a JSON object.'])
    expect(validateAdjustment({summary: 'x', items: []}, context()).problems.join()).toMatch(/two or three sentences/)
  })
})

describe('nearestInstant', () => {
  test('reads HH:MM on the right side of midnight', () => {
    // A segment planned for 23:50 WAT, moved to 00:10: the next day, not 23 hours earlier.
    expect(new Date(nearestInstant('00:10', '2026-12-12T22:50:00.000Z')).toISOString()).toBe('2026-12-12T23:10:00.000Z')
    // A segment planned for 00:05 WAT, pulled back to 23:58: the day before.
    expect(new Date(nearestInstant('23:58', '2026-12-12T23:05:00.000Z')).toISOString()).toBe('2026-12-12T22:58:00.000Z')
    expect(new Date(nearestInstant('15:20', at('15:00'))).toISOString()).toBe(at('15:20'))
  })
})

describe('planApply', () => {
  const changes = validateAdjustment(good, context()).changes!

  test('writes each changed segment against the revision it was read at', () => {
    const plan = planApply(changes, items)
    expect('writes' in plan && plan.writes.map((w) => [w.id, w.rev, w.plannedDuration])).toEqual([
      ['speeches', 'r1', 30],
      ['cake', 'r1', 15],
      ['floor', 'r1', 42],
    ])
  })

  test('refuses if a segment started since the proposal', () => {
    const started = items.map((i) => (i._id === 'speeches' ? {...i, actualStart: at('15:09')} : i))
    expect(planApply(changes, started)).toEqual({problem: '"Speeches" has started since the proposal. Nothing was changed; ask the agent again.'})
  })

  test('refuses if someone else re-timed a segment since the proposal', () => {
    const moved = items.map((i) => (i._id === 'cake' ? {...i, plannedStart: at('15:25')} : i))
    expect(planApply(changes, moved)).toMatchObject({problem: expect.stringMatching(/re-timed by someone else/)})
  })

  test('applying twice writes nothing the second time', () => {
    const applied = items.map((i) => {
      const change = changes.find((c) => c.item._ref === i._id)
      return change ? {...i, plannedStart: change.toStart, plannedDuration: change.toDuration} : i
    })
    expect(planApply(changes, applied)).toEqual({writes: []})
  })
})

describe('the real handlers, through the workflow (bench)', () => {
  const coordinator: Actor = {kind: 'person', id: 'gAdaeze001', roles: ['administrator']}

  async function run(answers: unknown[]) {
    const {program, ...rest} = doc
    const bench = createBench({
      now: NOW.toISOString(),
      documents: [
        ...items.map(({_rev, ...item}) => ({...item, _type: 'programItem'})),
        {_id: 'program-1', _type: 'programOfEvents', items: items.map((i) => ({_type: 'reference', _ref: i._id, _key: i._id}))},
        {_id: 'bride', _type: 'familySide', side: 'bride', nonNegotiables: doc.families[0]!.rules},
        {_id: 'groom', _type: 'familySide', side: 'groom', nonNegotiables: doc.families[1]!.rules},
        {_id: rest._id, _type: 'programAdjustment', program: {_type: 'reference', _ref: program!._id}, driftMinutes: 18, note: rest.note},
      ],
    })
    await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [liveAdjustment]})
    const {instance} = await bench.startInstance({
      definition: 'live-adjustment',
      initialFields: [subjectField('adj-1', {type: 'programAdjustment'})],
      actor: coordinator,
    })
    const prompts: Record<string, string>[] = []
    const queue = [...answers]
    const runtime = createBenchEngine(bench, {
      effects: {
        handlers: adjustmentHandlers({
          now: () => NOW,
          prompt: async ({instructionParams}) => {
            prompts.push(instructionParams)
            return queue.shift()
          },
        }),
      },
    })
    return {bench, id: instance._id, prompts, drain: () => runtime.drainEffects({instanceId: instance._id})}
  }

  test('retries with the validator’s problems, writes the proposal, and applies it only after a person approves', async () => {
    const {bench, id, prompts, drain} = await run([withItems([{durationMinutes: 35}]), good])
    await drain()
    expect(prompts).toHaveLength(2)
    expect(prompts[1]!.problems).toMatch(/longer than planned/)
    expect(await bench.currentStage(id)).toBe('awaiting-coordinator')
    const proposed = await bench.client.getDocument('adj-1')
    expect(proposed).toMatchObject({summary: good.summary})
    expect((proposed?.changes as unknown[]).length).toBe(3)
    // Nothing moves before approval.
    expect((await bench.client.getDocument('floor'))?.plannedDuration).toBe(60)

    await bench.fireAction({instanceId: id, activity: 'decide', action: 'approve', params: {onBehalfOf: 'Adaeze'}, actor: coordinator})
    await drain()
    expect(await bench.currentStage(id)).toBe('applied')
    expect(await bench.client.getDocument('floor')).toMatchObject({plannedStart: at('15:53'), plannedDuration: 42})
    expect(await bench.client.getDocument('speeches')).toMatchObject({plannedStart: at('15:08'), plannedDuration: 30})
    expect((await bench.client.getDocument('adj-1'))?.appliedAt).toBe(NOW.toISOString())
  })

  test('three bad answers end the adjustment not applied, with the reason on the record', async () => {
    const bad = withItems([{start: '15:00'}])
    const {bench, id, prompts, drain} = await run([bad, bad, bad])
    await drain()
    expect(prompts).toHaveLength(3)
    expect(await bench.currentStage(id)).toBe('not-applied')
    const instance = await bench.getInstance({instanceId: id})
    expect(instance.fields.find((f) => f.name === 'problem')?.value).toMatch(/could not produce a valid proposal after 3 attempts.*before 15:08/)
    expect((await bench.client.getDocument('speeches'))?.plannedStart).toBe(at('14:50'))
  })

  test('a segment started between approval and apply: nothing is written', async () => {
    const {bench, id, drain} = await run([good])
    await drain()
    await bench.fireAction({instanceId: id, activity: 'decide', action: 'approve', params: {onBehalfOf: 'Adaeze'}, actor: coordinator})
    await bench.client.patch('speeches').set({actualStart: at('15:09')}).commit()
    await drain()
    expect(await bench.currentStage(id)).toBe('not-applied')
    const instance = await bench.getInstance({instanceId: id})
    expect(instance.fields.find((f) => f.name === 'problem')?.value).toBe('"Speeches" has started since the proposal. Nothing was changed; ask the agent again.')
    expect((await bench.client.getDocument('floor'))?.plannedDuration).toBe(60)
    expect((await bench.client.getDocument('adj-1'))?.appliedAt).toBeUndefined()
  })
})
