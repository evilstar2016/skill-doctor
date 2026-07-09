import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.scenario.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
