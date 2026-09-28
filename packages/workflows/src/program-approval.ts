import {
  defineAction,
  defineActivity,
  defineField,
  defineGuard,
  defineOp,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

import {PEOPLE_ONLY} from './actors'

const SIDES = [
  {side: 'bride', title: "Bride's family"},
  {side: 'groom', title: "Groom's family"},
] as const

type Side = (typeof SIDES)[number]['side']

const decisionField = (side: Side) => `${side}Decision`

/** One row in the `decisions` log: who decided what, for which family, and why. */
function decisionRow(side: Side | 'coordinator', outcome: string, withReason: boolean) {
  return defineOp({
    type: 'field.append',
    target: {scope: 'workflow', field: 'decisions'},
    value: {
      type: 'object',
      fields: {
        side: {type: 'literal', value: side},
        outcome: {type: 'literal', value: outcome},
        onBehalfOf: {type: 'param', param: 'onBehalfOf'},
        ...(withReason ? {reason: {type: 'param', param: 'reason'}} : {}),
        by: {type: 'actor'},
        at: {type: 'now'},
      },
    },
  })
}

const onBehalfOfParam = {
  type: 'string',
  name: 'onBehalfOf',
  title: 'On behalf of',
  description: 'The family approver this decision is made for, as named on the family side.',
  required: true,
  validation: {min: 2},
} as const

const reasonParam = {
  type: 'string',
  name: 'reason',
  title: 'Reason',
  description: 'What must change. The agent redrafts against this, so be specific.',
  required: true,
  validation: {min: 10, max: 1000},
} as const

function familyApproval(side: Side, title: string) {
  return defineActivity({
    name: `${side}-approval`,
    title,
    description: `${title} reviews this version of the program.`,
    actions: [
      defineAction({
        name: 'approve',
        title: 'Approve',
        filter: PEOPLE_ONLY,
        params: [onBehalfOfParam],
        status: 'done',
        ops: [
          defineOp({
            type: 'field.set',
            target: {scope: 'stage', field: decisionField(side)},
            value: {type: 'literal', value: 'approved'},
          }),
          decisionRow(side, 'approved', false),
        ],
        semantics: ['decision.accept'],
      }),
      defineAction({
        name: 'reject',
        title: 'Reject with reason',
        filter: PEOPLE_ONLY,
        params: [onBehalfOfParam, reasonParam],
        status: 'done',
        ops: [
          defineOp({
            type: 'field.set',
            target: {scope: 'stage', field: decisionField(side)},
            value: {type: 'literal', value: 'rejected'},
          }),
          defineOp({
            type: 'field.set',
            target: {scope: 'workflow', field: 'lastRejection'},
            value: {
              type: 'object',
              fields: {
                side: {type: 'literal', value: side},
                reason: {type: 'param', param: 'reason'},
                onBehalfOf: {type: 'param', param: 'onBehalfOf'},
                by: {type: 'actor'},
                at: {type: 'now'},
              },
            },
          }),
          decisionRow(side, 'rejected', true),
        ],
        semantics: ['decision.decline'],
      }),
    ],
  })
}

// While families review, and after the program is locked, the program document itself
// must not change: families approve a specific version, and a locked program is what was printed.
// Program items are separate documents and stay editable, because the coordinator writes
// actual start and end times into them on the day.
// Guard names must be unique per definition, so each stage gets its own.
const freezeProgram = (stage: string) =>
  defineGuard({
    name: `freeze-program-${stage}`,
    title: 'Program is frozen',
    description:
      'The running order cannot change while the families review it or after it is locked. Reopen it through the workflow instead.',
    match: {idRefs: [{type: 'fieldRead', field: 'subject'}], actions: ['update', 'publish']},
  })

export const programApproval = defineWorkflow({
  name: 'program-approval',
  title: 'Program of events approval',
  description:
    'The agent drafts the running order from the couple’s brief and both families’ non-negotiables. Both families must approve the same version before it is printed. The coordinator locks it; changes after that go through Reopen.',
  initialStage: 'drafting',
  start: {
    requirements: [
      {
        type: 'singleSubject',
        name: 'one-approval-per-program',
        title: 'This program already has an approval in progress',
      },
    ],
  },
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Program of events',
      types: ['programOfEvents'],
      initialValue: {type: 'input'},
      required: true,
    }),
    defineField({
      type: 'object',
      name: 'lastRejection',
      title: 'Last rejection',
      description: 'The most recent family rejection. The agent redrafts against this reason.',
      fields: [
        {type: 'string', name: 'side'},
        {type: 'string', name: 'reason'},
        {type: 'string', name: 'onBehalfOf'},
        {type: 'actor', name: 'by'},
        {type: 'datetime', name: 'at'},
      ],
    }),
    defineField({
      type: 'array',
      name: 'decisions',
      title: 'Decisions',
      description: 'Every approval, rejection, lock and reopen, in order.',
      of: [
        {
          type: 'object',
          name: 'decision',
          fields: [
            {type: 'string', name: 'side'},
            {type: 'string', name: 'outcome'},
            {type: 'string', name: 'onBehalfOf'},
            {type: 'string', name: 'reason'},
            {type: 'actor', name: 'by'},
            {type: 'datetime', name: 'at'},
          ],
        },
      ],
    }),
    defineField({
      type: 'notes',
      name: 'notes',
      title: 'Drafting notes',
      description: 'What each submission changed, written by whoever submitted it.',
    }),
  ],
  stages: [
    defineStage({
      name: 'drafting',
      title: 'Drafting',
      description: 'The agent drafts or redrafts the program, then submits it to both families.',
      activities: [
        defineActivity({
          name: 'draft',
          title: 'Draft the program',
          requirements: [
            {
              type: 'groq',
              name: 'has-items',
              title: 'The program has no items yet',
              query: 'count($fields.subject.items) > 0',
            },
          ],
          actions: [
            defineAction({
              name: 'submit',
              title: 'Submit to both families',
              params: [
                {
                  type: 'string',
                  name: 'note',
                  title: 'What changed',
                  required: true,
                  validation: {min: 5, max: 2000},
                },
              ],
              status: 'done',
              ops: [
                defineOp({
                  type: 'field.append',
                  target: {scope: 'workflow', field: 'notes'},
                  value: {
                    type: 'object',
                    fields: {
                      body: {type: 'param', param: 'note'},
                      actor: {type: 'actor'},
                      at: {type: 'now'},
                    },
                  },
                }),
              ],
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'to-family-review', title: 'Send to both families', to: 'family-review'})],
    }),
    defineStage({
      name: 'family-review',
      title: 'Family review',
      description: 'Both families review the same version in parallel. Either can reject with a reason.',
      fields: [
        defineField({
          type: 'string',
          name: 'brideDecision',
          options: {list: [{title: 'Approved', value: 'approved'}, {title: 'Rejected', value: 'rejected'}]},
        }),
        defineField({
          type: 'string',
          name: 'groomDecision',
          options: {list: [{title: 'Approved', value: 'approved'}, {title: 'Rejected', value: 'rejected'}]},
        }),
      ],
      guards: [freezeProgram('family-review')],
      activities: SIDES.map(({side, title}) => familyApproval(side, title)),
      transitions: [
        // Declared first: a rejection from either side wins over a pending approval.
        defineTransition({
          name: 'back-to-drafting',
          title: 'Rejected: back to drafting',
          to: 'drafting',
          when: '$fields.brideDecision == "rejected" || $fields.groomDecision == "rejected"',
        }),
        defineTransition({
          name: 'to-ready-for-print',
          title: 'Both families approved',
          to: 'ready-for-print',
          when: '$fields.brideDecision == "approved" && $fields.groomDecision == "approved"',
        }),
      ],
    }),
    defineStage({
      name: 'ready-for-print',
      title: 'Ready for print',
      description: 'Both families approved this version. The coordinator locks it for printing.',
      guards: [freezeProgram('ready-for-print')],
      activities: [
        defineActivity({
          name: 'lock',
          title: 'Lock the program',
          actions: [
            defineAction({
              name: 'lock',
              title: 'Lock for printing',
              filter: PEOPLE_ONLY,
              params: [{...onBehalfOfParam, description: 'The coordinator locking the program.'}],
              status: 'done',
              ops: [decisionRow('coordinator', 'locked', false)],
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'to-locked', title: 'Locked', to: 'locked'})],
    }),
    defineStage({
      name: 'locked',
      title: 'Locked',
      description: 'This is the printed program. Changing it means reopening it, which sends it back through both families.',
      guards: [freezeProgram('locked')],
      activities: [
        defineActivity({
          name: 'reopen',
          title: 'Reopen the program',
          actions: [
            defineAction({
              name: 'reopen',
              title: 'Reopen with reason',
              filter: PEOPLE_ONLY,
              params: [{...onBehalfOfParam, description: 'The coordinator reopening the program.'}, reasonParam],
              status: 'done',
              ops: [
                defineOp({
                  type: 'field.set',
                  target: {scope: 'workflow', field: 'lastRejection'},
                  value: {
                    type: 'object',
                    fields: {
                      side: {type: 'literal', value: 'coordinator'},
                      reason: {type: 'param', param: 'reason'},
                      onBehalfOf: {type: 'param', param: 'onBehalfOf'},
                      by: {type: 'actor'},
                      at: {type: 'now'},
                    },
                  },
                }),
                decisionRow('coordinator', 'reopened', true),
              ],
            }),
          ],
        }),
      ],
      transitions: [defineTransition({name: 'reopened', title: 'Reopened: back to drafting', to: 'drafting'})],
    }),
  ],
})
