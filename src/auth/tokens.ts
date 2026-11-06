import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, gt, lt, or, isNotNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { loginTokens, sessions, users, type User } from "../db/schema.js";

export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createLoginToken(db: Db, email: string, now = Date.now()): string {
  const token = newToken();
  db.insert(loginTokens)
    .values({ tokenHash: hashToken(token), email, expiresAt: new Date(now + LOGIN_TOKEN_TTL_MS) })
    .run();
  return token;
}

/** Marks the token used and returns its email, or null if unknown, used or expired. */
export function consumeLoginToken(db: Db, token: string, now = Date.now()): string | null {
  const row = db
    .update(loginTokens)
    .set({ usedAt: new Date(now) })
    .where(
      and(
        eq(loginTokens.tokenHash, hashToken(token)),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date(now)),
      ),
    )
    .returning({ email: loginTokens.email })
    .get();
  return row?.email ?? null;
}

export function createSession(db: Db, userId: number, now = Date.now()): { token: string; expiresAt: Date } {
  const token = newToken();
  const expiresAt = new Date(now + SESSION_TTL_MS);
  db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt }).run();
  return { token, expiresAt };
}

export function userForSession(db: Db, token: string, now = Date.now()): User | null {
  const row = db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date(now))))
    .get();
  return row?.user ?? null;
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
}

export function purgeExpired(db: Db, now = Date.now()): void {
  const t = new Date(now);
  db.delete(sessions).where(lt(sessions.expiresAt, t)).run();
  db.delete(loginTokens)
    .where(or(lt(loginTokens.expiresAt, t), isNotNull(loginTokens.usedAt)))
    .run();
}
