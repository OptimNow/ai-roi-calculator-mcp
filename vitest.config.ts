import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/src/**/*.test.ts'],
  },
  resolve: {
    // The synced engine uses ESM-style ./x.js specifiers that point at .ts sources
    extensions: ['.ts', '.js', '.json'],
  },
});
