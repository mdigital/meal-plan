import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { openDb } from "../src/db/index.js";
import { applyStagedRestore, createBackup, listBackups, pruneBackups, stageRestore, verifyBackup } from "../src/backup.js";
import { seedIfNeeded } from "../src/seed.js";
import { listMeals } from "../src/services/meals.js";
import { backupDue, runBackup } from "../src/jobs.js";
import { buildMime, MemoryMailer } from "../src/lib/mailer.js";
import { setup, signIn, ROBIN } from "./helpers.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meals-backup-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("backups", () => {
  it("restore test: back up, lose data, restore, and get it back", async () => {
    const dbPath = join(dir, "meals.db");
    let db = openDb(dbPath);
    seedIfNeeded(db);
    const before = listMeals(db).length;
    const backup = await createBackup(db, join(dir, "backups"));
    expect(verifyBackup(backup).counts.meal).toBe(before);

    // Disaster: everything is deleted.
    db.$client.exec("delete from meal");
    expect(listMeals(db)).toHaveLength(0);
    db.$client.close();

    // Stage the restore, then "restart": the staged copy is swapped in before opening.
    stageRestore(backup, dbPath);
    const kept = applyStagedRestore(dbPath)!;
    expect(existsSync(kept)).toBe(true);
    db = openDb(dbPath);
    expect(listMeals(db)).toHaveLength(before);
    expect(listMeals(db).find((m) => m.name === "Snapper and white beans")!.proteinG).toBe(48);
    db.$client.close();
    expect(applyStagedRestore(dbPath)).toBeNull(); // nothing staged any more
  });

  it("refuses a corrupt backup", () => {
    const bad = join(dir, "meals-bad.db.gz");
    writeFileSync(bad, Buffer.from("not a gzip"));
    expect(() => verifyBackup(bad)).toThrow();
    expect(() => stageRestore(bad, join(dir, "meals.db"))).toThrow();
    expect(existsSync(join(dir, "meals.db.restore"))).toBe(false);
  });

  it("keeps the newest 14 backups", () => {
    for (let i = 10; i < 30; i++) writeFileSync(join(dir, `meals-2026-11-${i}T03-00-00-000Z.db.gz`), "x");
    pruneBackups(dir);
    const left = listBackups(dir);
    expect(left).toHaveLength(14);
    expect(left[0]).toContain("2026-11-16");
  });

  it("is due once a day after 3am NZ", () => {
    // 2026-11-06 13:00 UTC = 2026-11-07 02:00 NZDT (too early); 15:00 UTC = 04:00 NZDT.
    expect(backupDue(dir, Date.UTC(2026, 10, 6, 13))).toBe(false);
    expect(backupDue(dir, Date.UTC(2026, 10, 6, 15))).toBe(true);
    const f = join(dir, "meals-x.db.gz");
    writeFileSync(f, "x");
    const t = Date.UTC(2026, 10, 6, 15) / 1000;
    utimesSync(f, t, t);
    expect(backupDue(dir, Date.UTC(2026, 10, 6, 20))).toBe(false); // same NZ day
    expect(backupDue(dir, Date.UTC(2026, 10, 7, 15))).toBe(true); // next NZ day
  });

  it("emails the nightly backup to the owner", async () => {
    const mailer = new MemoryMailer();
    const t = setup({ mailer });
    t.deps.config.backup = { dir, email: ROBIN };
    seedIfNeeded(t.deps.db);
    const path = await runBackup(t.deps);
    expect(existsSync(path)).toBe(true);
    expect(mailer.attachments).toHaveLength(1);
    const { mail, attachment } = mailer.attachments[0]!;
    expect(mail.to).toBe(ROBIN);
    expect(mail.text).toContain("17 meals");
    expect(attachment.contentType).toBe("application/gzip");
    expect(gunzipSync(attachment.content).subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  it("builds a valid MIME message with the attachment", () => {
    const mime = buildMime("Meals <m@example.com>", { to: "r@example.com", subject: "Backup", text: "hi" }, { filename: "a b.gz", content: Buffer.from("abc"), contentType: "application/gzip" }, "BOUND");
    expect(mime).toContain('Content-Type: multipart/mixed; boundary="BOUND"');
    expect(mime).toContain('filename="a_b.gz"');
    expect(mime).toContain("YWJj"); // base64 of "abc"
    expect(mime.trimEnd().endsWith("--BOUND--")).toBe(true);
  });

  it("lets a signed-in user download a backup", async () => {
    const t = setup();
    t.deps.config.backup = { dir, email: undefined };
    const client = await signIn(t);
    const res = await client.get("/settings/backup");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");
    const body = Buffer.from(await res.arrayBuffer());
    expect(gunzipSync(body).subarray(0, 15).toString()).toBe("SQLite format 3");
    expect(readdirSync(join(dir, "downloads"))).toHaveLength(0); // temp copy removed
    expect((await t.client().get("/settings/backup")).status).toBe(302); // signed out
  });
});
