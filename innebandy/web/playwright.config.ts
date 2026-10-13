import { defineConfig } from "@playwright/test";

// Expects the local stack to be running: scripts/local_supabase.sh start,
// scripts/dev_api.sh and `npm run dev` (see README).
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1600, height: 1000 },
    screenshot: "only-on-failure",
  },
  outputDir: "test-results",
});
