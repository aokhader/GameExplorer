import { defineConfig } from 'vitest/config';

// Unit tests only. Playwright owns e2e/, and Vitest's default pattern would
// also pick up its *.spec.ts files and fail on them.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
