import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

// Declared by hand: @types/node here would change vite's peer resolution and break apps/web's typecheck.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  // Every spec drives a software WebGL context; running them side by side starves the frame loop.
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Headless Chromium has no GPU: without these WebGL is refused outright.
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
      // For a machine whose browser download is blocked: any recent Chromium build will do.
      ...(process.env['DB_CHROMIUM_PATH'] ? { executablePath: process.env['DB_CHROMIUM_PATH'] } : {}),
    },
  },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // HANDOFF §5: a reused server serves a stale dist. Always build and serve this tree.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
