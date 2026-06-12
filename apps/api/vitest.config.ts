import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The E2E suite talks to a real Socket.io server and waits on the 500ms
    // matchmaking polling loop, so the default 5s is too tight.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
