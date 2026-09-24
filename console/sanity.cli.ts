import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  server: {port: 3334},
  app: {
    organizationId: 'oH7TaXCA4',
    entry: './src/App.tsx',
  },
})
