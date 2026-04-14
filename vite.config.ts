import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'app',
      importProtection: {
        // In dev, import-protection warns + mocks server imports in the
        // client graph. In prod, its default is to error on violations,
        // which breaks builds for our server-fn wrapper pattern (every
        // foo.ts re-exports impls from foo.server.ts). Match dev behavior
        // in prod: replace the violating imports with safe mocks.
        behavior: { dev: 'mock', build: 'mock' },
      },
    }),
    react(),
  ],
  server: {
    port: 3000,
  },
  ssr: {
    // Keep server-only packages out of the SSR bundle so Rollup doesn't
    // try to rewrite their node:* imports.
    external: [
      'postgres',
      'pg',
      'ioredis',
      'bullmq',
      'better-auth',
      '@better-auth/api-key',
      '@better-auth/passkey',
      '@anthropic-ai/sdk',
      'resend',
      'drizzle-orm',
      'sharp',
    ],
  },
})
