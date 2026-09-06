import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Headless bot playtests simulate minutes of game time; CI runners are ~3x slower than a dev box.
    testTimeout: 30_000,
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/*.test.ts', 'src/index.ts'] },
  },
});
