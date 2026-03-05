import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['__tests__/setup.ts'],
    include: [
      '__tests__/unit/**/*.test.ts',
      '__tests__/integration/**/*.test.ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.next'
    ],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'lib/**/*.ts'
      ],
      exclude: [
        'node_modules/',
        '__tests__/',
        '*.config.ts',
        '.next/',
        'dist/',
        'lib/types.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
});
