// Browser tests against an isolated stack: backend/scripts/e2e-server.js (in-memory MongoDB, fake AI,
// captured email) on :3100 and the production frontend build on :5181. Never points at a real database.
//
//   npm run test:e2e
//
// Browser: Playwright's Chromium if installed (npx playwright install chromium), or any Chrome given
// in PLAYWRIGHT_CHROME_PATH.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3100;
const WEB_PORT = 5181;

// Reuse a local Chrome for Testing when Playwright's own browser has not been downloaded.
const fallbackChrome = `${homedir()}/.cache/puppeteer/chrome/mac_arm-153.0.8010.36/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || (existsSync(fallbackChrome) ? fallbackChrome : undefined);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  // The fake AI's behaviour is global to the server, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "./e2e/.report", open: "never" }]],
  use: {
    // Everything on 127.0.0.1: `localhost` can resolve to IPv4 or IPv6 depending on the tool, and the
    // frontend and API must share a site for the session cookie.
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    timezoneId: "America/New_York",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: "node ../backend/scripts/e2e-server.js",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_FRONTEND_ORIGIN: `http://127.0.0.1:${WEB_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // The production build (what gets deployed), served by `vite preview`. Tools are invoked
      // through node: npx/.bin lookups (and Vite's dev server) break when the path contains a colon.
      command: `node node_modules/vite/bin/vite.js build --outDir e2e/.dist --emptyOutDir --logLevel warn && node node_modules/vite/bin/vite.js preview --outDir e2e/.dist --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { VITE_API_URL: `http://127.0.0.1:${API_PORT}/api`, VITE_USE_MOCK_API: "false" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
