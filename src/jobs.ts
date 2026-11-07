import { statSync } from "node:fs";
import type { Deps } from "./context.js";
import { createBackup, describeBackup, listBackups, verifyBackup } from "./backup.js";
import { nzToday } from "./services/days.js";

const BACKUP_HOUR_NZ = 3;

function nzHour(now: number): number {
  return Number(new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", hourCycle: "h23" }).format(now));
}

/** True if a backup should run now: after 3am NZ and none made yet today (NZ). */
export function backupDue(dir: string, now: number): boolean {
  if (nzHour(now) < BACKUP_HOUR_NZ) return false;
  const latest = listBackups(dir).at(-1);
  if (!latest) return true;
  return nzToday(statSync(latest).mtimeMs) !== nzToday(now);
}

/** Makes a backup, checks it opens cleanly, and emails it to the owner. */
export async function runBackup(deps: Deps): Promise<string> {
  const path = await createBackup(deps.db, deps.config.backup.dir, new Date(deps.now()));
  const summary = verifyBackup(path);
  console.log(`[backup] wrote ${describeBackup(path)}: ${summary.counts.meal} meals, ${summary.counts.user} users`);
  if (deps.config.backup.email) {
    try {
      const { readFileSync } = await import("node:fs");
      await deps.mailer.sendWithAttachment(
        {
          to: deps.config.backup.email,
          subject: `Meals backup ${nzToday(deps.now())}`,
          text: `Nightly backup of the Meals database: ${summary.counts.meal} meals, ${summary.counts.food} foods, ${summary.counts.day_plan} days, ${summary.counts.shopping_list} shopping lists.\n\nTo restore, see "Backups and restore" in the README.`,
        },
        { filename: path.split("/").pop()!, content: readFileSync(path), contentType: "application/gzip" },
      );
    } catch (err) {
      console.error("[backup] email failed", err);
    }
  }
  return path;
}

export function startBackupSchedule(deps: Deps, intervalMs = 15 * 60 * 1000): NodeJS.Timeout {
  let running = false;
  const tick = async () => {
    if (running || !backupDue(deps.config.backup.dir, deps.now())) return;
    running = true;
    try {
      await runBackup(deps);
    } catch (err) {
      console.error("[backup] failed", err);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, intervalMs).unref();
}
