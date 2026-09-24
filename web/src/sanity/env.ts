// Publishable values only. Tokens are read in server-only modules.
export const projectId = required(process.env.NEXT_PUBLIC_SANITY_PROJECT_ID, 'NEXT_PUBLIC_SANITY_PROJECT_ID')
export const dataset = required(process.env.NEXT_PUBLIC_SANITY_DATASET, 'NEXT_PUBLIC_SANITY_DATASET')
export const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION ?? '2026-09-24'

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See web/.env.example.`)
  return value
}
