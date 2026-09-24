import type {SanityConfig} from '@sanity/sdk'

// Project and dataset are not secrets. The console authenticates as the signed-in
// Dashboard user, so no token is bundled.
export const PROJECT_ID = 'qyn1i646'
export const CONTENT_DATASET = 'production'

export const sanityConfigs: SanityConfig[] = [{projectId: PROJECT_ID, dataset: CONTENT_DATASET}]
