import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['.github/skills/**/tests/*.test.ts'],
  },
});
