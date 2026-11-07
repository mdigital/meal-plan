// Maintenance commands. On Fly: fly ssh console -C "node dist/cli.js <command>"
import { loadConfig } from "./config.js";
import { describeBackup, listBackups, stageRestore, verifyBackup } from "./backup.js";

const [cmd, arg] = process.argv.slice(2);
const config = loadConfig();

async function main() {
  switch (cmd) {
    case "backup": {
      const { buildDeps } = await import("./deps.js");
      const { runBackup } = await import("./jobs.js");
      const deps = buildDeps(config);
      const path = await runBackup(deps);
      console.log(`Backup written: ${describeBackup(path)}`);
      deps.db.$client.close();
      break;
    }
    case "list":
      for (const f of listBackups(config.backup.dir)) console.log(describeBackup(f));
      break;
    case "verify": {
      if (!arg) throw new Error("usage: verify <backup.db.gz>");
      console.log(JSON.stringify(verifyBackup(arg), null, 2));
      break;
    }
    case "restore": {
      if (!arg) throw new Error("usage: restore <backup.db.gz>");
      const summary = stageRestore(arg, config.databasePath);
      console.log(`Backup verified (${summary.counts.meal} meals, ${summary.counts.user} users) and staged.`);
      console.log("Restart the app to swap it in: fly apps restart <app> (or restart the dev server).");
      break;
    }
    default:
      console.log("Commands: backup | list | verify <file> | restore <file>");
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
