import type {NextConfig} from 'next'

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source, not a build.
  transpilePackages: ['@owambe/shared', '@owambe/workflows'],
  // Next 16 writes AGENTS.md/CLAUDE.md into the app on dev; this repo keeps its docs at the root.
  agentRules: false,
  // Bachs refuses localhost redirects, so local payment tests run through a Cloudflare quick tunnel.
  allowedDevOrigins: ['*.trycloudflare.com', '*.outray.app'],
}

export default nextConfig
