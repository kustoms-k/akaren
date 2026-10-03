import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Each test file gets its own in-memory database; no network access is needed.
    pool: 'forks',
  },
});
