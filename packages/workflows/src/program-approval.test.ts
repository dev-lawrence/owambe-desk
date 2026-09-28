import {ActionDisabledError, type Actor, StartNotAllowedError} from '@sanity/workflow-engine'
import {createBench, GuardDeniedError, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, test} from 'vitest'

import {programApproval} from './program-approval'

const T0 = '2026-10-01T09:00:00.000Z'

// Ids in the formats the engine actually resolves: people as "g" + id, robot tokens as
// "g-…" (tokens created by the current Sanity CLI, like the agent's) or "p-…" (older robots).
const brideFather: Actor = {kind: 'person', id: 'gAdebayo01', roles: ['administrator']}
const groomElder: Actor = {kind: 'person', id: 'gIkechukwu1', roles: ['administrator']}
const coordinator: Actor = {kind: 'person', id: 'gAdaeze001', roles: ['administrator']}
const agent: Actor = {kind: 'agent', id: 'g-owambeagent', roles: ['editor']}
// What @sanity/workflow-engine 0.35.0 actually produces for the agent's robot token:
// kind "person" (every token resolves to person) with the robot's "g-" id.
const agentAsResolvedToday: Actor = {kind: 'person', id: 'g-owambeagent', roles: ['editor']}
const legacyRobot: Actor = {kind: 'person', id: 'p-legacyrobot', roles: ['editor']}

const program = {
  _id: 'program-1',
  _type: 'programOfEvents',
  version: 1,
  brief: 'Two families, one reception.',
  items: [{_type: 'reference', _ref: 'item-1', _key: 'k1'}],
}
const emptyProgram = {_id: 'program-empty', _type: 'programOfEvents', version: 0, brief: 'Not drafted yet.', items: []}
const item = {_id: 'item-1', _type: 'programItem', title: 'Breaking of kola nut', plannedDuration: 15}

async function start(subject = 'program-1') {
  const bench = createBench({
    now: T0,
    documents: [program, {...program, _id: 'drafts.program-1'}, emptyProgram, item, {...item, _id: 'drafts.item-1'}],
  })
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [programApproval]})
  const {instance} = await bench.startInstance({
    definition: 'program-approval',
    initialFields: [subjectField(subject, {type: 'programOfEvents'})],
  })
  return {bench, id: instance._id}
}

async function submitted() {
  const ctx = await start()
  await ctx.bench.fireAction({
    instanceId: ctx.id,
    activity: 'draft',
    action: 'submit',
    params: {note: 'First draft from the couple’s brief.'},
    actor: agent,
  })
  return ctx
}

const onBehalfOf = (name: string) => ({onBehalfOf: name})

describe('drafting', () => {
  test('a new approval starts in drafting', async () => {
    const {bench, id} = await start()
    expect(await bench.currentStage(id)).toBe('drafting')
  })

  test('an empty program cannot be submitted', async () => {
    const {bench, id} = await start('program-empty')
    await expect(
      bench.fireAction({instanceId: id, activity: 'draft', action: 'submit', params: {note: 'Nothing here yet'}, actor: agent}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
    expect(await bench.currentStage(id)).toBe('drafting')
  })

  test('the agent submits through the same transition a person would use', async () => {
    const {bench, id} = await submitted()
    expect(await bench.currentStage(id)).toBe('family-review')

    const instance = await bench.getInstance({instanceId: id})
    const submit = instance.history.find((entry) => entry._type === 'actionFired' && entry.action === 'submit')
    // The agent is identified in history by its own robot id.
    expect(submit).toMatchObject({actor: {id: 'g-owambeagent'}})
    const moved = instance.history.find((entry) => entry._type === 'transitionFired' && entry.toStage === 'family-review')
    expect(moved).toBeDefined()
  })

  // Pins a known engine limitation (BUILD_LOG.md, Phase 2): actors are resolved from the token via
  // /users/me and always stamped kind "person", even when the caller is the agent. If a later
  // engine starts stamping "agent", this test fails and we update the history UI and the log.
  test('engine 0.35.0 stamps the agent as kind "person" (known limitation)', async () => {
    const {bench, id} = await submitted()
    const instance = await bench.getInstance({instanceId: id})
    const submit = instance.history.find((entry) => entry._type === 'actionFired' && entry.action === 'submit')
    expect(submit).toMatchObject({actor: {kind: 'person', id: 'g-owambeagent'}})
  })

  test('only one approval can run per program', async () => {
    const {bench} = await start()
    await expect(
      bench.startInstance({
        definition: 'program-approval',
        initialFields: [subjectField('program-1', {type: 'programOfEvents'})],
      }),
    ).rejects.toBeInstanceOf(StartNotAllowedError)
  })
})

describe('the agent can never approve', () => {
  for (const [label, actor] of [
    ['as an agent actor', agent],
    ['as the robot token resolves in engine 0.35.0 (kind "person", "g-" robot id)', agentAsResolvedToday],
    ['as an older project robot token ("p-" id)', legacyRobot],
  ] as const) {
    test(`approve and reject are refused ${label}`, async () => {
      const {bench, id} = await submitted()

      const evaluation = await bench.evaluate({instanceId: id, actor})
      const familyActions = evaluation.currentStage.activities.flatMap((activity) => activity.actions)
      for (const action of familyActions) {
        expect(action).toMatchObject({allowed: false, disabledReason: {kind: 'filter-failed'}})
      }

      await expect(
        bench.fireAction({instanceId: id, activity: 'bride-approval', action: 'approve', params: onBehalfOf('Agent'), actor}),
      ).rejects.toBeInstanceOf(ActionDisabledError)
      await expect(
        bench.fireAction({
          instanceId: id,
          activity: 'groom-approval',
          action: 'reject',
          params: {...onBehalfOf('Agent'), reason: 'Trying to reject as the agent.'},
          actor,
        }),
      ).rejects.toBeInstanceOf(ActionDisabledError)
      expect(await bench.currentStage(id)).toBe('family-review')
    })
  }

  test('the agent cannot lock or reopen either', async () => {
    const {bench, id} = await submitted()
    await bench.fireAction({instanceId: id, activity: 'bride-approval', action: 'approve', params: onBehalfOf('Chief Adebayo Adeyemi'), actor: brideFather})
    await bench.fireAction({instanceId: id, activity: 'groom-approval', action: 'approve', params: onBehalfOf('Chief Ikechukwu Okafor'), actor: groomElder})
    await expect(
      bench.fireAction({instanceId: id, activity: 'lock', action: 'lock', params: onBehalfOf('Agent'), actor: agentAsResolvedToday}),
    ).rejects.toBeInstanceOf(ActionDisabledError)
  })
})

describe('family review converges', () => {
  test('one side approving alone does not reach ready for print', async () => {
    const {bench, id} = await submitted()
    await bench.fireAction({instanceId: id, activity: 'bride-approval', action: 'approve', params: onBehalfOf('Chief Adebayo Adeyemi'), actor: brideFather})

    expect(await bench.currentStage(id)).toBe('family-review')
    expect(await bench.activityStatus(id, 'bride-approval')).toBe('done')
    expect(await bench.activityStatus(id, 'groom-approval')).toBe('active')
  })

  test('both sides approving reaches ready for print, in either order', async () => {
    const {bench, id} = await submitted()
    await bench.fireAction({instanceId: id, activity: 'groom-approval', action: 'approve', params: onBehalfOf('Chief Ikechukwu Okafor'), actor: groomElder})
    expect(await bench.currentStage(id)).toBe('family-review')
    await bench.fireAction({instanceId: id, activity: 'bride-approval', action: 'approve', params: onBehalfOf('Chief Adebayo Adeyemi'), actor: brideFather})
    expect(await bench.currentStage(id)).toBe('ready-for-print')
  })
})

describe('rejection', () => {
  test('a rejection without a reason is refused', async () => {
    const {bench, id} = await submitted()
    await expect(
      bench.fireAction({instanceId: id, activity: 'groom-approval', action: 'reject', params: onBehalfOf('Chief Ikechukwu Okafor'), actor: groomElder}),
    ).rejects.toThrow()
    await expect(
      bench.fireAction({
        instanceId: id,
        activity: 'groom-approval',
        action: 'reject',
        params: {...onBehalfOf('Chief Ikechukwu Okafor'), reason: 'No.'},
        actor: groomElder,
      }),
    ).rejects.toThrow()
    expect(await bench.currentStage(id)).toBe('family-review')
  })

  test('a rejection with a reason returns the program to drafting, reason attached', async () => {
    const {bench, id} = await submitted()
    const reason = 'Kola must be broken before any food is served. Move the kola nut before small chops.'
    await bench.fireAction({
      instanceId: id,
      activity: 'groom-approval',
      action: 'reject',
      params: {...onBehalfOf('Chief Ikechukwu Okafor'), reason},
      actor: groomElder,
    })

    expect(await bench.currentStage(id)).toBe('drafting')
    const instance = await bench.getInstance({instanceId: id})
    const fields = Object.fromEntries(instance.fields.map((field) => [field.name, field.value]))
    expect(fields.lastRejection).toMatchObject({side: 'groom', reason, onBehalfOf: 'Chief Ikechukwu Okafor', by: {id: groomElder.id}})
    expect(fields.decisions).toEqual([
      expect.objectContaining({side: 'groom', outcome: 'rejected', reason, by: expect.objectContaining({id: groomElder.id})}),
    ])
  })

  test('after a redraft, both families must approve again', async () => {
    const {bench, id} = await submitted()
    await bench.fireAction({instanceId: id, activity: 'bride-approval', action: 'approve', params: onBehalfOf('Chief Adebayo Adeyemi'), actor: brideFather})
    await bench.fireAction({
      instanceId: id,
      activity: 'groom-approval',
      action: 'reject',
      params: {...onBehalfOf('Chief Ikechukwu Okafor'), reason: 'Highlife band must play for the parents’ dance.'},
      actor: groomElder,
    })
    await bench.fireAction({instanceId: id, activity: 'draft', action: 'submit', params: {note: 'Moved the parents’ dance to the band.'}, actor: agent})

    expect(await bench.currentStage(id)).toBe('family-review')
    // The bride's earlier approval was for the old version; it does not carry over.
    expect(await bench.activityStatus(id, 'bride-approval')).toBe('active')
    await bench.fireAction({instanceId: id, activity: 'groom-approval', action: 'approve', params: onBehalfOf('Chief Ikechukwu Okafor'), actor: groomElder})
    expect(await bench.currentStage(id)).toBe('family-review')
  })
})

describe('locking and reopening', () => {
  async function locked() {
    const ctx = await submitted()
    const {bench, id} = ctx
    await bench.fireAction({instanceId: id, activity: 'bride-approval', action: 'approve', params: onBehalfOf('Chief Adebayo Adeyemi'), actor: brideFather})
    await bench.fireAction({instanceId: id, activity: 'groom-approval', action: 'approve', params: onBehalfOf('Chief Ikechukwu Okafor'), actor: groomElder})
    await bench.fireAction({instanceId: id, activity: 'lock', action: 'lock', params: onBehalfOf('Adaeze Nwosu'), actor: coordinator})
    return ctx
  }

  test('the coordinator locks an approved program', async () => {
    const {bench, id} = await locked()
    expect(await bench.currentStage(id)).toBe('locked')
  })

  test('a locked program cannot be edited silently, but program items stay editable for the day', async () => {
    const {bench} = await locked()
    await expect(
      bench.editDocument({documentId: 'drafts.program-1', patch: {set: {brief: 'Quietly changed'}}}),
    ).rejects.toThrow(GuardDeniedError)
    await bench.editDocument({documentId: 'drafts.item-1', patch: {set: {actualStart: '2026-12-12T14:05:00.000Z'}}})
  })

  test('the program is frozen while families review it', async () => {
    const {bench} = await submitted()
    await expect(
      bench.editDocument({documentId: 'drafts.program-1', patch: {set: {brief: 'Changed during review'}}}),
    ).rejects.toThrow(GuardDeniedError)
  })

  test('reopening needs a reason and sends the program back to drafting', async () => {
    const {bench, id} = await locked()
    await expect(
      bench.fireAction({instanceId: id, activity: 'reopen', action: 'reopen', params: onBehalfOf('Adaeze Nwosu'), actor: coordinator}),
    ).rejects.toThrow()
    await bench.fireAction({
      instanceId: id,
      activity: 'reopen',
      action: 'reopen',
      params: {...onBehalfOf('Adaeze Nwosu'), reason: 'The venue moved the start to 3pm.'},
      actor: coordinator,
    })
    expect(await bench.currentStage(id)).toBe('drafting')
    // Edits are allowed again once it is back in drafting.
    await bench.editDocument({documentId: 'drafts.program-1', patch: {set: {brief: 'Start at 3pm'}}})
  })
})
