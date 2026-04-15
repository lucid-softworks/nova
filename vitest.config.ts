import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './app'),
    },
  },
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
    // Keep tests hermetic — they should never touch Redis or Postgres.
    globals: false,
  },
})
