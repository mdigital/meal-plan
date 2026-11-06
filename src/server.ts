import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { buildDeps } from "./deps.js";
import { purgeExpired } from "./auth/tokens.js";
import { seedIfNeeded } from "./seed.js";

const deps = buildDeps();
const port = Number(process.env.PORT ?? 3000);
const app = createApp(deps);

if (deps.config.allowedUsers.length === 0) console.warn("ALLOWED_EMAILS is empty: nobody can sign in.");

if (seedIfNeeded(deps.db)) console.log("Loaded seed meals and foods.");
purgeExpired(deps.db);
setInterval(() => purgeExpired(deps.db), 60 * 60 * 1000).unref();

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
