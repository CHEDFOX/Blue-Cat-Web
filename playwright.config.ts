import { defineConfig } from "@playwright/test";

// End-to-end tests need a running ULIS API with the sample corpus ingested
// (see README). The Next.js server is started here unless E2E_BASE_URL is set.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 60_000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
