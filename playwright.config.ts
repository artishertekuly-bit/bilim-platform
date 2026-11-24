// End-to-end tests for the Simulation Lab. They run against a dedicated Vite dev server and the
// dev-only harness route (/dev/lab/:slug), so no sign-in, test account or network write is needed.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // A cold Vite dev server compiles the app on the first visit, so the budget is generous.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Reduced motion switches the 3D scene to on-demand rendering, which keeps the software
    // WebGL renderer of headless Chromium from saturating the CPU between interactions.
    reducedMotion: 'reduce',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
