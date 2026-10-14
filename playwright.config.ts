import os from "node:os";
import path from "node:path";

import { defineConfig } from "@playwright/test";

// Search/provision tests (tests/e2e/research.spec.ts) need a running ULIS API with the sample corpus
// ingested (see README) and skip themselves when it is not reachable. The research-assistant tests
// (tests/e2e/assistant.spec.ts) run in mock mode and need no backend.
// The Next.js server is built-and-started here (run `npm run build` first) unless E2E_BASE_URL is set.
process.env.FEEDBACK_FILE ??= path.join(os.tmpdir(), "ulis-e2e-feedback.jsonl");

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}/access`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
          NODE_ENV: "production",
          EARLY_ACCESS_CODES: "e2e-code,e2e-limit-code",
          SESSION_SECRET: "e2e-session-secret-0123456789",
          ULIS_RESEARCH_MOCK: "1",
          ULIS_RESEARCH_MOCK_STEP_MS: "500",
          ULIS_RESEARCH_POLL_MS: "400",
          RESEARCH_DAILY_LIMIT: "6",
          FEEDBACK_FILE: process.env.FEEDBACK_FILE,
        },
      },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
