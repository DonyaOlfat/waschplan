import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    env: {
      DATABASE_URL: 'postgresql://waschplan:waschplan@localhost:5432/waschplan_test',
    },
  },
});
