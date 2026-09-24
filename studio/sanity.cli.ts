import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? 'qyn1i646',
    dataset: process.env.SANITY_STUDIO_DATASET ?? 'production',
  },
  studioHost: 'owambe-desk',
  deployment: {autoUpdates: true},
  typegen: {
    enabled: true,
    path: ['../web/src/**/*.{ts,tsx}', '../packages/shared/src/**/*.ts'],
    schema: 'schema.json',
    generates: '../packages/shared/src/sanity.types.ts',
    overloadClientMethods: true,
  },
})
