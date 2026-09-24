import type {NextConfig} from 'next'

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source, not a build.
  transpilePackages: ['@owambe/shared'],
  // Next 16 writes AGENTS.md/CLAUDE.md into the app on dev; this repo keeps its docs at the root.
  agentRules: false,
}

export default nextConfig
