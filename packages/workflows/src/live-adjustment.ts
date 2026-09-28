import {type GdrUri, parseGdr} from '@sanity/workflow-engine'
import {
  defineAction,
  defineActivity,
  defineEffect,
  defineField,
  defineGuard,
  defineOp,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

import {PEOPLE_ONLY} from './actors'

/** Effect names. The agent runtime registers handlers under these (scripts/agent/adjust.ts). */
export const PROPOSE_EFFECT = 'propose-adjustment'
export const APPLY_EFFECT = 'apply-adjustment'

/** Both effects receive the adjustment as a GDR URI. Returns it typed, with its bare document id. */
export function adjustmentFromParams(params: Record<string, unknown>): {uri: GdrUri; documentId: string} {
  const value = params.adjustment
  if (typeof value !== 'string' || !value.startsWith('dataset:')) throw new Error(`Expected a dataset GDR for the adjustment, got ${JSON.stringify(value)}`)
  const uri = value as GdrUri
  return {uri, documentId: parseGdr(uri).documentId}
}

// What the coordinator approves must be exactly what gets applied.
const freezeProposal = (stage: string) =>
  defineGuard({
    name: `freeze-proposal-${stage}`,
    title: 'Proposal is fixed',
    description: 'The proposal cannot change once it is in front of the coordinator. Ask the agent again instead.',
    match: {idRefs: [{type: 'fieldRead', field: 'subject'}], actions: ['update', 'publish']},
    // appliedAt is written by the apply step itself, so it stays writable.
    predicate: '!delta::changedAny((program, driftMinutes, note, summary, changes))',
  })

const coordinatorParam = {
  type: 'string',
  name: 'onBehalfOf',
  title: 'Coordinator',
  description: 'The coordinator making this decision.',
  required: true,
  validation: {min: 2},
} as const

function decision(outcome: 'approved' | 'rejected' | 'withdrawn', withReason: boolean) {
  return defineOp({
    type: 'field.set',
    target: {scope: 'workflow', field: 'decision'},
    value: {
      type: 'object',
      fields: {
        outcome: {type: 'literal', value: outcome},
        onBehalfOf: {type: 'param', param: 'onBehalfOf'},
        ...(withReason ? {reason: {type: 'param', param: 'reason'}} : {}),
        by: {type: 'actor'},
        at: {type: 'now'},
      },
    },
  })
}

const effectFor = (name: string, title: string, description: string) =>
  defineEffect({
    name,
    title,
    description,
    // A global document reference (GDR URI), e.g. "dataset:qyn1i646:production:<id>". The handler
    // reads the adjustment and program itself, so it always works from current content.
    bindings: {adjustment: '$fields.subject._id'},
  })

export const liveAdjustment = defineWorkflow({
  name: 'live-adjustment',
  title: 'Live program adjustment',
  description:
    'On the day, when the program runs more than ten minutes late, the coordinator asks the agent to re-time and trim what is left. The agent proposes; only a person can approve or reject. An approved proposal is applied to the remaining segments in one transaction.',
  initialStage: 'proposing',
  start: {
    requirements: [{type: 'singleSubject', name: 'one-workflow-per-adjustment', title: 'This adjustment already has a workflow'}],
  },
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Adjustment',
      types: ['programAdjustment'],
      initialValue: {type: 'input'},
      required: true,
    }),
    defineField({
      type: 'object',
      name: 'decision',
      title: 'Decision',
      description: 'The coordinator’s approval, rejection or withdrawal, with who made it.',
      fields: [
        {type: 'string', name: 'outcome'},
        {type: 'string', name: 'onBehalfOf'},
        {type: 'string', name: 'reason'},
        {type: 'actor', name: 'by'},
        {type: 'datetime', name: 'at'},
      ],
    }),
    defineField({
      type: 'string',
      name: 'problem',
      title: 'Problem',
      description:
        'Why the agent could not propose, or why an approved proposal could not be applied. Written by the agent runtime before it reports the failure, because a failed effect keeps no error text of its own.',
    }),
  ],
  stages: [
    defineStage({
      name: 'proposing',
      title: 'Agent is proposing',
      description: 'The agent reads what has run, what is left and both families’ non-negotiables, and writes a proposal.',
      activities: [
        defineActivity({
          name: 'propose',
          title: 'Agent proposes a re-timing',
          actions: [
            defineAction({
              name: 'request',
              title: 'Ask the agent',
              when: 'true',
              status: 'done',
              effects: [
                effectFor(
                  PROPOSE_EFFECT,
                  'Agent writes a proposal',
                  'Runs the agent. It writes a summary and the changed segment times onto the adjustment.',
                ),
              ],
            }),
          ],
        }),
        defineActivity({
          name: 'withdraw',
          title: 'Withdraw the request',
          description: 'If the agent is taking too long, the coordinator can withdraw and run the day by hand.',
          actions: [
            defineAction({
              name: 'withdraw',
              title: 'Withdraw',
              filter: PEOPLE_ONLY,
              params: [coordinatorParam],
              status: 'done',
              ops: [decision('withdrawn', false)],
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({
          name: 'withdrawn',
          title: 'Withdrawn',
          to: 'withdrawn',
          when: '$fields.decision.outcome == "withdrawn"',
        }),
        defineTransition({
          name: 'proposed',
          title: 'Proposal ready',
          to: 'awaiting-coordinator',
          when: `$effectStatus['${PROPOSE_EFFECT}'] == 'done'`,
        }),
        defineTransition({
          name: 'no-proposal',
          title: 'Agent could not propose',
          to: 'not-applied',
          when: `$effectStatus['${PROPOSE_EFFECT}'] == 'failed'`,
        }),
      ],
    }),
    defineStage({
      name: 'awaiting-coordinator',
      title: 'Waiting for the coordinator',
      description: 'The proposal is ready. Only a person can approve or reject it; the agent cannot.',
      guards: [freezeProposal('awaiting-coordinator')],
      activities: [
        defineActivity({
          name: 'decide',
          title: 'Coordinator decides',
          requirements: [
            {type: 'groq', name: 'has-changes', title: 'The proposal changes nothing', query: 'count($fields.subject.changes) > 0'},
          ],
          actions: [
            defineAction({
              name: 'approve',
              title: 'Approve and apply',
              filter: PEOPLE_ONLY,
              params: [coordinatorParam],
              status: 'done',
              ops: [decision('approved', false)],
              semantics: ['decision.accept'],
            }),
            defineAction({
              name: 'reject',
              title: 'Reject with reason',
              filter: PEOPLE_ONLY,
              params: [
                coordinatorParam,
                {
                  type: 'string',
                  name: 'reason',
                  title: 'Reason',
                  description: 'Why this proposal does not work. Kept on the record.',
                  required: true,
                  validation: {min: 5, max: 1000},
                },
              ],
              status: 'done',
              ops: [decision('rejected', true)],
              semantics: ['decision.decline'],
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({name: 'rejected', title: 'Rejected', to: 'rejected', when: '$fields.decision.outcome == "rejected"'}),
        defineTransition({name: 'approved', title: 'Approved', to: 'applying', when: '$fields.decision.outcome == "approved"'}),
      ],
    }),
    defineStage({
      name: 'applying',
      title: 'Applying',
      description: 'The approved times are being written to the remaining segments.',
      guards: [freezeProposal('applying')],
      activities: [
        defineActivity({
          name: 'apply',
          title: 'Apply the approved times',
          actions: [
            defineAction({
              name: 'apply',
              title: 'Apply',
              when: 'true',
              status: 'done',
              effects: [
                effectFor(
                  APPLY_EFFECT,
                  'Write the new times',
                  'Writes every changed segment and the adjustment’s appliedAt in one transaction. Refuses if a segment has started or moved since the proposal.',
                ),
              ],
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({name: 'applied', title: 'Applied', to: 'applied', when: `$effectStatus['${APPLY_EFFECT}'] == 'done'`}),
        defineTransition({
          name: 'apply-failed',
          title: 'Could not apply',
          to: 'not-applied',
          when: `$effectStatus['${APPLY_EFFECT}'] == 'failed'`,
        }),
      ],
    }),
    defineStage({name: 'applied', title: 'Applied', description: 'The remaining segments run on the new times.', guards: [freezeProposal('applied')]}),
    defineStage({name: 'rejected', title: 'Rejected', description: 'The coordinator turned the proposal down. Nothing was changed.'}),
    defineStage({name: 'withdrawn', title: 'Withdrawn', description: 'The coordinator withdrew the request. Nothing was changed.'}),
    defineStage({
      name: 'not-applied',
      title: 'Not applied',
      description: 'The agent could not produce a valid proposal, or the program moved on before it could be applied. Nothing was changed.',
    }),
  ],
})
