// E2E harness (July 2026 audit remediation). Tests run against the
// PRODUCTION build (`next start`) because hydration errors are minified
// and only reproduce there — run `npm run test:e2e` (builds first) or
// start the server yourself and `npx playwright test`.
const { defineConfig } = require("@playwright/test");

const PORT = process.env.E2E_PORT || 3100;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 }, // mobile-first product
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
