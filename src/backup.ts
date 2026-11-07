import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Db } from "./db/index.js";

export const KEEP_BACKUPS = 14;
const TABLES = ["user", "meal", "meal_ingredient", "food", "day_plan", "day_entry", "shopping_list", "shopping_item", "pantry_staple"];

export type BackupSummary = { counts: Record<string, number>; bytes: number };

/** Writes a consistent, gzipped copy of the live database. Safe while the app is running. */
export async function createBackup(db: Db, dir: string, now = new Date()): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const tmp = join(dir, `.meals-${stamp}.db`);
  await db.$client.backup(tmp);
  const out = join(dir, `meals-${stamp}.db.gz`);
  writeFileSync(out, gzipSync(readFileSync(tmp)));
  rmSync(tmp, { force: true });
  pruneBackups(dir);
  return out;
}

export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^meals-.*\.db\.gz$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

export function pruneBackups(dir: string, keep = KEEP_BACKUPS): void {
  const all = listBackups(dir);
  for (const f of all.slice(0, Math.max(0, all.length - keep))) rmSync(f, { force: true });
}

/** Opens a backup, checks its integrity and returns row counts. Throws if it is not a good backup. */
export function verifyBackup(gzPath: string): BackupSummary {
  const raw = gunzipSync(readFileSync(gzPath));
  const tmp = join(dirname(gzPath), `.verify-${process.pid}-${Date.now()}.db`);
  writeFileSync(tmp, raw);
  try {
    const check = new Database(tmp, { readonly: true, fileMustExist: true });
    try {
      const ok = check.pragma("integrity_check", { simple: true });
      if (ok !== "ok") throw new Error(`integrity check failed: ${String(ok)}`);
      const counts: Record<string, number> = {};
      for (const t of TABLES) counts[t] = (check.prepare(`select count(*) as n from "${t}"`).get() as { n: number }).n;
      return { counts, bytes: raw.length };
    } finally {
      check.close();
    }
  } finally {
    rmSync(tmp, { force: true });
  }
}

export function stagedRestorePath(databasePath: string): string {
  return `${databasePath}.restore`;
}

/** Verifies a backup and stages it to replace the database on the next start. */
export function stageRestore(gzPath: string, databasePath: string): BackupSummary {
  const summary = verifyBackup(gzPath);
  writeFileSync(stagedRestorePath(databasePath), gunzipSync(readFileSync(gzPath)));
  return summary;
}

/**
 * Called at startup, before the database is opened. If a restore is staged,
 * keeps the current database alongside as *.before-restore-<time> and swaps the
 * staged copy in. Returns the path of the kept copy, or null if nothing was staged.
 */
export function applyStagedRestore(databasePath: string, now = new Date()): string | null {
  const staged = stagedRestorePath(databasePath);
  if (!existsSync(staged)) return null;
  const kept = `${databasePath}.before-restore-${now.toISOString().replace(/[:.]/g, "-")}`;
  if (existsSync(databasePath)) renameSync(databasePath, kept);
  for (const suffix of ["-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
  renameSync(staged, databasePath);
  return kept;
}

export function describeBackup(path: string): string {
  return `${basename(path)} (${Math.round(statSync(path).size / 1024)} KB)`;
}
