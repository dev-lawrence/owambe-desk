import type {SanityConfig} from '@sanity/sdk'
import type {WorkflowResource} from '@sanity/workflow-engine'

// Project and dataset are not secrets. The console authenticates as the signed-in
// Dashboard user, so no token is bundled.
export const PROJECT_ID = 'qyn1i646'
export const CONTENT_DATASET = 'production'

export const sanityConfigs: SanityConfig[] = [{projectId: PROJECT_ID, dataset: CONTENT_DATASET}]

// Workflow engine documents live in the content dataset under this tag (see packages/workflows).
export const WORKFLOW_TAG = 'owambe'
export const WORKFLOW_RESOURCE: WorkflowResource = {type: 'dataset', id: `${PROJECT_ID}.${CONTENT_DATASET}`}

/** Global document reference URI for a content document, as workflow subjects store it. */
export const gdr = (documentId: string) => `dataset:${PROJECT_ID}:${CONTENT_DATASET}:${documentId}` as const

export const API_VERSION = '2026-09-24'
