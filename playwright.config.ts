import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3457;
const run = join(tmpdir(), "meals-e2e");
export const MAIL_LOG = join(run, "mail.log");
process.env.MAIL_LOG_FILE = MAIL_LOG;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", ...devices["iPhone 13"], browserName: "chromium" },
  webServer: [
    {
      command: "node e2e/stub-anthropic.mjs",
      port: 4599,
      reuseExistingServer: false,
    },
    {
      command: `rm -rf ${run} && mkdir -p ${run} && npx tsx src/server.ts`,
      port: PORT,
      reuseExistingServer: false,
      env: {
        PORT: String(PORT),
        DATABASE_PATH: join(run, "meals.db"),
        ALLOWED_EMAILS: "robin@example.com:Robin,sam@example.com:Sam",
        APP_URL: `http://localhost:${PORT}`,
        EMAIL_LOG_LINKS: "1",
        MAIL_LOG_FILE: MAIL_LOG,
        ANTHROPIC_API_KEY: "test-key",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:4599",
      },
    },
  ],
});
