import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  outputDir: './test-results/browser',
  reporter: [['list'], ['json', { outputFile: './test-results/browser-results.json' }]],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
    headless: true,
    launchOptions: { executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
