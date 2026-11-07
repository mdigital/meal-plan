import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { buildDeps } from "./deps.js";
import { purgeExpired } from "./auth/tokens.js";
import { seedIfNeeded, upgradeSeedRecipes } from "./seed.js";
import { startBackupSchedule } from "./jobs.js";

const deps = buildDeps();
const port = Number(process.env.PORT ?? 3000);
const app = createApp(deps);

if (deps.config.allowedUsers.length === 0) console.warn("ALLOWED_EMAILS is empty: nobody can sign in.");

if (seedIfNeeded(deps.db)) console.log("Loaded seed meals and foods.");
const upgrade = upgradeSeedRecipes(deps.db);
if (upgrade) console.log(`[seed] recipes upgraded: ${JSON.stringify(upgrade)}`);
purgeExpired(deps.db);
setInterval(() => purgeExpired(deps.db), 60 * 60 * 1000).unref();
if (deps.config.production || process.env.BACKUP_SCHEDULE === "1") startBackupSchedule(deps);

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on http://0.0.0.0:${info.port}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    deps.db.$client.close();
    process.exit(0);
  });
}
