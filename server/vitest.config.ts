import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { pool: 'threads', testTimeout: 20000, hookTimeout: 20000 } });
