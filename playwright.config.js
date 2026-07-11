// E2E harness (July 2026 audit remediation). Tests run against the
// PRODUCTION build (`next start`) because hydration errors are minified
// and only reproduce there — run `npm run test:e2e` (builds first) or
// start the server yourself and `npx playwright test`.
const { defineConfig } = require("@playwright/test");

const PORT = process.env.E2E_PORT || 3100;

// v5.42: set E2E_BASE_URL (e.g. https://www.gowayfind.com) to run the suite
// against a deployed site instead of a local build — used for post-deploy
// live smoke verification. No local server is started in that mode.
const LIVE = process.env.E2E_BASE_URL;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: LIVE || `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 }, // mobile-first product
  },
  webServer: LIVE
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
