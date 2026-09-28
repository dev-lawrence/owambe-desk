import {visionTool} from '@sanity/vision'
import {workflowDefaultDocumentNode, workflowStudioPlugin} from '@sanity/workflow-studio-plugin'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

export default defineConfig({
  name: 'owambe-desk',
  title: 'Owambe Desk',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? 'qyn1i646',
  dataset: process.env.SANITY_STUDIO_DATASET ?? 'production',
  plugins: [
    structureTool({structure, defaultDocumentNode: workflowDefaultDocumentNode()}),
    // Workflow definitions are deployed from packages/workflows under the "owambe" tag,
    // into this same dataset.
    workflowStudioPlugin({
      tag: 'owambe',
      mappings: [{docType: 'programOfEvents', definition: 'program-approval', label: 'Family approval'}],
    }),
    visionTool({defaultApiVersion: '2026-09-24'}),
  ],
  schema: {types: schemaTypes},
})
