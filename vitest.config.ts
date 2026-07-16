import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // getSessionSecret() reads NODE_ENV at module load; tests assert behavior
    // for specific envs, so isolate each test file's module registry.
    isolate: true,
  },
})
