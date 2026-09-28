import type {WorkflowDeploymentInput} from '@sanity/workflow-engine'
import {defineWorkflowConfig} from '@sanity/workflow-engine/define'

import {asoEbiOrder} from './src/aso-ebi-order'
import {liveAdjustment} from './src/live-adjustment'
import {programApproval} from './src/program-approval'

// Engine documents (definitions, instances, guards) live in the content dataset itself.
// A separate dataset would need cross-resource clients on every engine (agent, Studio,
// web, console) so the engine can write guards beside the content. Engine document ids
// contain dots, which Sanity keeps out of anonymous reads of a public dataset.
export const production = {
  name: 'production',
  tag: 'owambe',
  // Reviewed literal: every runtime sharing this resource is on Workflows 0.35.0, which
  // reads model 10. Required because the subject field is required.
  expectedMinReaderModel: 10,
  workflowResource: {type: 'dataset', id: 'qyn1i646.production'},
  definitions: [programApproval, asoEbiOrder, liveAdjustment],
} satisfies WorkflowDeploymentInput

export default defineWorkflowConfig({deployments: [production]})
