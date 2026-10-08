import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['@pricehub/source', 'module', 'node', 'default'],
  },
  ssr: {
    resolve: {
      conditions: ['@pricehub/source', 'module', 'node', 'default'],
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['apps/*/test/unit/**/*.test.ts', 'packages/*/test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['apps/*/test/integration/**/*.test.ts', 'packages/*/test/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 180_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
