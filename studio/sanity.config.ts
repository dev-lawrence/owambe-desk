import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

export default defineConfig({
  name: 'owambe-desk',
  title: 'Owambe Desk',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? 'qyn1i646',
  dataset: process.env.SANITY_STUDIO_DATASET ?? 'production',
  plugins: [structureTool({structure}), visionTool({defaultApiVersion: '2026-09-24'})],
  schema: {types: schemaTypes},
})
