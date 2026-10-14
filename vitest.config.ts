import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/parser/src/**/*.test.ts','apps/api/src/**/*.test.ts'], exclude: ['node_modules/**'] } });
