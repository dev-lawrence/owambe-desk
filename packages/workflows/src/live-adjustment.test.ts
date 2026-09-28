import {ActionDisabledError, type Actor, type EffectHandler} from '@sanity/workflow-engine'
import {createBench, createBenchEngine, GuardDeniedError, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, test} from 'vitest'

import {adjustmentFromParams, APPLY_EFFECT, liveAdjustment, PROPOSE_EFFECT} from './live-adjustment'

const T0 = '2026-12-12T15:30:00.000Z'

// Ids in the formats the engine resolves (see actors.ts).
const agent: Actor = {kind: 'person', id: 'g-wR8d7ewDOtYd', roles: ['editor']}
const coordinator: Actor = {kind: 'person', id: 'gAdaeze001', roles: ['administrator']}

const adjustment = {
  _id: 'adj-1',
  _type: 'programAdjustment',
  program: {_type: 'reference', _ref: 'program-1'},
  driftMinutes: 18,
}
const item = {_id: 'item-1', _type: 'programItem', title: 'Speeches', plannedStart: '2026-12-12T15:10:00.000Z', plannedDuration: 30}

const proposal = {
  summary: 'Speeches shortened by ten minutes so the cake stays on time.',
  changes: [
    {
      _key: 'c1',
      _type: 'segmentChange',
      item: {_type: 'reference', _ref: 'item-1'},
      fromStart: item.plannedStart,
      fromDuration: 30,
      toStart: '2026-12-12T15:28:00.000Z',
      toDuration: 20,
    },
  ],
}

type Seen = {propose: unknown[]; apply: unknown[]}

/** What the real handlers do on failure: record the reason on the instance, then fail the effect. */
async function fail(ctx: Parameters<EffectHandler>[1], problem: string): Promise<never> {
  await ctx.commitOps({
    idempotencyKey: `${ctx.effectKey}:problem`,
    ops: [{type: 'field.set', target: {scope: 'workflow', field: 'problem'}, value: {type: 'literal', value: problem}}],
  })
  throw new Error(problem)
}

/** Stand-ins for the agent runtime's handlers: write what the real ones write, through the handler client. */
function handlers(seen: Seen, opts: {proposeFails?: boolean; applyFails?: boolean; emptyProposal?: boolean} = {}) {
  const propose: EffectHandler = async (params, ctx) => {
    seen.propose.push(params)
    if (opts.proposeFails) await fail(ctx, 'The agent could not produce a valid proposal after 3 attempts')
    const adjustment = adjustmentFromParams(params)
    await ctx.clientFor(adjustment.uri).patch(adjustment.documentId).set(opts.emptyProposal ? {summary: 'Nothing to change.', changes: []} : proposal).commit()
  }
  const apply: EffectHandler = async (params, ctx) => {
    seen.apply.push(params)
    if (opts.applyFails) await fail(ctx, 'Speeches has started since the proposal; not applied')
    const adjustment = adjustmentFromParams(params)
    const client = ctx.clientFor(adjustment.uri)
    await client
      .transaction()
      .patch(client.patch('item-1').set({plannedStart: '2026-12-12T15:28:00.000Z', plannedDuration: 20}))
      .patch(client.patch(adjustment.documentId).set({appliedAt: '2026-12-12T15:31:00.000Z'}))
      .commit()
  }
  return {[PROPOSE_EFFECT]: propose, [APPLY_EFFECT]: apply}
}

async function asked(opts: Parameters<typeof handlers>[1] = {}) {
  const bench = createBench({now: T0, documents: [adjustment, item]})
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [liveAdjustment]})
  const {instance} = await bench.startInstance({
    definition: 'live-adjustment',
    initialFields: [subjectField('adj-1', {type: 'programAdjustment'})],
    actor: coordinator,
  })
  const seen: Seen = {propose: [], apply: []}
  const runtime = createBenchEngine(bench, {effects: {handlers: handlers(seen, opts)}})
  return {bench, id: instance._id, seen, drain: () => runtime.drainEffects({instanceId: instance._id})}
}

async function proposed() {
  const ctx = await asked()
  await ctx.drain()
  return ctx
}

const as = (name: string) => ({onBehalfOf: name})
const doc = async (bench: Awaited<ReturnType<typeof asked>>['bench'], id: string) => bench.client.getDocument(id)

describe('asking the agent', () => {
  test('asking queues the agent with the adjustment id, and waits for it', async () => {
    const {bench, id, seen, drain} = await asked()
    expect(await bench.currentStage(id)).toBe('proposing')
    expect(await bench.listPendingEffects({instanceId: id})).toHaveLength(1)
    await drain()
    expect(seen.propose).toEqual([{adjustment: 'dataset:test:test:adj-1'}])
    expect(await bench.currentStage(id)).toBe('awaiting-coordinator')
  })

  test('if the agent fails, nothing is changed and the reason is on the record', async () => {
    const {bench, id, drain} = await asked({proposeFails: true})
    await drain()
    expect(await bench.currentStage(id)).toBe('not-applied')
    const instance = await bench.getInstance({instanceId: id})
    const failed = instance.history.find((h) => h._type === 'effectCompleted')
    expect(failed).toMatchObject({effect: PROPOSE_EFFECT, status: 'failed'})
    expect(instance.fields.find((f) => f.name === 'problem')?.value).toBe('The agent could not produce a valid proposal after 3 attempts')
    expect((await doc(bench, 'item-1'))?.plannedDuration).toBe(30)
  })

  test('the coordinator can withdraw while the agent is still working; the agent cannot', async () => {
    const {bench, id} = await asked()
    await expect(
      bench.fireAction({instanceId: id, activity: 'withdraw', action: 'withdraw', params: as('Owambe agent'), actor: agent}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
    await bench.fireAction({instanceId: id, activity: 'withdraw', action: 'withdraw', params: as('Adaeze'), actor: coordinator})
    expect(await bench.currentStage(id)).toBe('withdrawn')
  })
})

describe('only a person decides', () => {
  test('the agent cannot approve or reject its own proposal', async () => {
    const {bench, id} = await proposed()
    const evaluation = await bench.evaluate({instanceId: id, actor: agent})
    const actions = evaluation.currentStage.activities.flatMap((a) => a.actions)
    for (const name of ['approve', 'reject']) {
      expect(actions.find((a) => a.action.name === name)).toMatchObject({allowed: false, disabledReason: {kind: 'filter-failed'}})
    }
    await expect(
      bench.fireAction({instanceId: id, activity: 'decide', action: 'approve', params: as('Owambe agent'), actor: agent}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
    expect(await bench.currentStage(id)).toBe('awaiting-coordinator')
  })

  test('the proposal is frozen while the coordinator looks at it', async () => {
    const {bench} = await proposed()
    await expect(bench.editDocument({documentId: 'adj-1', patch: {set: {changes: []}}})).rejects.toThrow(GuardDeniedError)
    await expect(bench.editDocument({documentId: 'adj-1', patch: {set: {summary: 'Something else'}}})).rejects.toThrow(GuardDeniedError)
  })

  test('an empty proposal cannot be approved', async () => {
    const {bench, id, drain} = await asked({emptyProposal: true})
    await drain()
    await expect(
      bench.fireAction({instanceId: id, activity: 'decide', action: 'approve', params: as('Adaeze'), actor: coordinator}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
  })

  test('a rejection needs a reason, changes nothing and records who rejected', async () => {
    const {bench, id, seen} = await proposed()
    await expect(
      bench.fireAction({instanceId: id, activity: 'decide', action: 'reject', params: as('Adaeze'), actor: coordinator}),
    ).rejects.toThrow()
    await bench.fireAction({
      instanceId: id,
      activity: 'decide',
      action: 'reject',
      params: {...as('Adaeze'), reason: 'Do not cut the speeches; cut the open floor instead.'},
      actor: coordinator,
    })
    expect(await bench.currentStage(id)).toBe('rejected')
    const instance = await bench.getInstance({instanceId: id})
    expect(instance.fields.find((f) => f.name === 'decision')?.value).toMatchObject({
      outcome: 'rejected',
      reason: 'Do not cut the speeches; cut the open floor instead.',
      by: {id: coordinator.id},
    })
    expect(seen.apply).toHaveLength(0)
    expect((await doc(bench, 'item-1'))?.plannedDuration).toBe(30)
  })
})

describe('applying', () => {
  test('approval queues the apply step; the segments move only then', async () => {
    const {bench, id, seen, drain} = await proposed()
    expect((await doc(bench, 'item-1'))?.plannedDuration).toBe(30)
    await bench.fireAction({instanceId: id, activity: 'decide', action: 'approve', params: as('Adaeze'), actor: coordinator})
    expect(await bench.currentStage(id)).toBe('applying')
    await drain()
    expect(seen.apply).toEqual([{adjustment: 'dataset:test:test:adj-1'}])
    expect(await bench.currentStage(id)).toBe('applied')
    expect(await doc(bench, 'item-1')).toMatchObject({plannedStart: '2026-12-12T15:28:00.000Z', plannedDuration: 20})
    expect((await doc(bench, 'adj-1'))?.appliedAt).toBe('2026-12-12T15:31:00.000Z')
  })

  test('if the program moved on, the apply step fails and the adjustment ends not applied', async () => {
    const {bench, id, drain} = await asked({applyFails: true})
    await drain()
    await bench.fireAction({instanceId: id, activity: 'decide', action: 'approve', params: as('Adaeze'), actor: coordinator})
    await drain()
    expect(await bench.currentStage(id)).toBe('not-applied')
    const instance = await bench.getInstance({instanceId: id})
    expect(instance.fields.find((f) => f.name === 'problem')?.value).toContain('has started since the proposal')
  })

  test('history shows who asked, who proposed, who approved', async () => {
    const {bench, id, drain} = await proposed()
    await bench.fireAction({instanceId: id, activity: 'decide', action: 'approve', params: as('Adaeze'), actor: coordinator})
    await drain()
    const instance = await bench.getInstance({instanceId: id})
    const fired = instance.history.filter((h) => h._type === 'actionFired').map((h) => [h.action, h.actor?.id])
    expect(fired).toContainEqual(['approve', coordinator.id])
    const effects = instance.history.filter((h) => h._type === 'effectCompleted').map((h) => [h.effect, h.status])
    expect(effects).toEqual([
      [PROPOSE_EFFECT, 'done'],
      [APPLY_EFFECT, 'done'],
    ])
  })
})
