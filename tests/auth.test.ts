import { describe, expect, it } from "vitest";
import { linkFrom, ROBIN, SAM, setup, signIn } from "./helpers.js";
import { consumeLoginToken, createLoginToken, LOGIN_TOKEN_TTL_MS, hashToken, newToken } from "../src/auth/tokens.js";
import { loginTokens } from "../src/db/schema.js";
import { RateLimiter } from "../src/auth/rate-limit.js";
import { safeNext } from "../src/routes/auth.js";
import { parseAllowedEmails } from "../src/config.js";

describe("login tokens", () => {
  it("are long, random and stored hashed", () => {
    const t = setup();
    const token = createLoginToken(t.deps.db, ROBIN, t.deps.now());
    expect(Buffer.from(token, "base64url").length).toBeGreaterThanOrEqual(32);
    const rows = t.deps.db.select().from(loginTokens).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
    expect(rows[0]!.tokenHash).not.toContain(token);
    expect(newToken()).not.toBe(newToken());
  });

  it("work once", () => {
    const t = setup();
    const token = createLoginToken(t.deps.db, ROBIN, t.deps.now());
    expect(consumeLoginToken(t.deps.db, token, t.deps.now())).toBe(ROBIN);
    expect(consumeLoginToken(t.deps.db, token, t.deps.now())).toBeNull();
  });

  it("expire after 15 minutes", () => {
    const t = setup();
    const start = t.deps.now();
    const a = createLoginToken(t.deps.db, ROBIN, start);
    const b = createLoginToken(t.deps.db, ROBIN, start);
    expect(consumeLoginToken(t.deps.db, a, start + LOGIN_TOKEN_TTL_MS - 1000)).toBe(ROBIN);
    expect(consumeLoginToken(t.deps.db, b, start + LOGIN_TOKEN_TTL_MS + 1)).toBeNull();
  });

  it("reject unknown tokens", () => {
    const t = setup();
    expect(consumeLoginToken(t.deps.db, "nope", t.deps.now())).toBeNull();
  });
});

describe("sign-in flow", () => {
  it("emails allowlisted users a link that signs them in", async () => {
    const t = setup();
    const client = t.client();
    const res = await client.post("/login", { email: "  Robin@Example.com " });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Check your email");
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]!.to).toBe(ROBIN);

    const { path, token } = linkFrom(t.mailer.sent[0]!.text);
    // Visiting the link does not consume it (protects against link scanners).
    const confirm = await client.get(path);
    expect(await confirm.text()).toContain(token);

    const verify = await client.post("/auth/verify", { token, next: "/meals" });
    expect(verify.status).toBe(303);
    expect(verify.headers.get("location")).toBe("/meals");
    const sc = verify.headers.getSetCookie().join("\n");
    expect(sc).toMatch(/sid=.*HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Max-Age=2592000/);

    const meals = await client.get("/meals");
    expect(meals.status).toBe(200);
    expect(await meals.text()).toContain("Signed in as Robin");
  });

  it("marks the session cookie Secure in production", async () => {
    const t = setup();
    t.deps.config.production = true;
    const client = t.client();
    await client.post("/login", { email: ROBIN });
    const { token } = linkFrom(t.mailer.sent[0]!.text);
    const verify = await client.post("/auth/verify", { token });
    expect(verify.headers.getSetCookie().join("\n")).toMatch(/sid=.*Secure/);
  });

  it("gives an unknown email the same response and no link", async () => {
    const t = setup();
    const known = await (await t.client().post("/login", { email: ROBIN })).text();
    const unknown = await (await t.client().post("/login", { email: "stranger@example.com" })).text();
    expect(t.mailer.sent).toHaveLength(1);
    const strip = (s: string) => s.replace(/value="[^"]*"/g, "");
    expect(strip(unknown)).toBe(strip(known));
  });

  it("lets both users sign in separately", async () => {
    const t = setup();
    const robin = await signIn(t, ROBIN);
    const sam = await signIn(t, SAM);
    expect(await (await robin.get("/meals")).text()).toContain("Robin");
    expect(await (await sam.get("/meals")).text()).toContain("Sam");
  });

  it("rejects a reused or expired link", async () => {
    const t = setup();
    const client = t.client();
    await client.post("/login", { email: ROBIN });
    const { token } = linkFrom(t.mailer.sent[0]!.text);
    t.advance(LOGIN_TOKEN_TTL_MS + 1);
    const res = await client.post("/auth/verify", { token });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("expired");
  });

  it("signs out", async () => {
    const t = setup();
    const client = await signIn(t);
    const res = await client.post("/logout");
    expect(res.status).toBe(303);
    const after = await client.get("/meals");
    expect(after.status).toBe(302);
    expect(after.headers.get("location")).toContain("/login");
  });

  it("expires sessions after 30 days", async () => {
    const t = setup();
    const client = await signIn(t);
    t.advance(31 * 24 * 60 * 60 * 1000);
    expect((await client.get("/meals")).status).toBe(302);
  });
});

describe("protection", () => {
  it("rejects form posts without the CSRF token", async () => {
    const t = setup();
    const client = await signIn(t);
    const res = await client.post("/logout", { _csrf: "wrong-token-wrong-token" });
    expect(res.status).toBe(403);
    const res2 = await client.post("/logout", {}, { csrf: false });
    expect(res2.status).toBe(403);
  });

  it("rejects cross-origin posts", async () => {
    const t = setup();
    const client = await signIn(t);
    const res = await client.post("/logout", {}, { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("rate-limits link requests per email", async () => {
    const t = setup();
    const client = t.client();
    for (let i = 0; i < 5; i++) expect((await client.post("/login", { email: ROBIN })).status).toBe(200);
    expect((await client.post("/login", { email: ROBIN })).status).toBe(429);
    expect(t.mailer.sent).toHaveLength(5);
  });

  it("rate-limits link requests per IP", async () => {
    const t = setup();
    const client = t.client();
    const headers = { "fly-client-ip": "203.0.113.9" };
    for (let i = 0; i < 20; i++) {
      expect((await client.post("/login", { email: `x${i}@example.com` }, { headers })).status).toBe(200);
    }
    expect((await client.post("/login", { email: "y@example.com" }, { headers })).status).toBe(429);
  });

  it("only redirects to local paths after sign-in", () => {
    expect(safeNext("/days")).toBe("/days");
    expect(safeNext("//evil.example")).toBe("/meals");
    expect(safeNext("https://evil.example")).toBe("/meals");
    expect(safeNext(undefined)).toBe("/meals");
  });

  it("rate limiter windows reset", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.hit("k", 0)).toBe(true);
    expect(rl.hit("k", 1)).toBe(true);
    expect(rl.hit("k", 2)).toBe(false);
    expect(rl.hit("k", 1001)).toBe(true);
  });

  it("parses the allowlist", () => {
    expect(parseAllowedEmails(" A@x.com:Ann , b@y.com ")).toEqual([
      { email: "a@x.com", name: "Ann" },
      { email: "b@y.com", name: "b" },
    ]);
  });
});
