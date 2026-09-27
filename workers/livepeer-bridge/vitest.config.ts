import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: { alias: { 'cloudflare:workers': new URL('./src/worker-entrypoint-test-stub.ts', import.meta.url).pathname } },
    test: {
        environment: 'node',
        globals: false,
        include: ['src/**/*.test.ts'],
    },
});
