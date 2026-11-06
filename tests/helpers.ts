import { createApp } from "../src/app.js";
import { parseAllowedEmails, type Config } from "../src/config.js";
import type { Deps } from "../src/context.js";
import { openDb } from "../src/db/index.js";
import { makeLimits } from "../src/deps.js";
import { MemoryMailer } from "../src/lib/mailer.js";

export const ROBIN = "robin@example.com";
export const SAM = "sam@example.com";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    production: false,
    appUrl: "http://localhost",
    databasePath: ":memory:",
    allowedUsers: parseAllowedEmails(`${ROBIN}:Robin,${SAM}:Sam`),
    email: { from: "Meals <meals@example.com>", logLinks: false },
    aiDailyCap: 3,
    ...overrides,
  };
}

export function setup(overrides: Partial<Deps> = {}) {
  let clock = Date.UTC(2026, 10, 6, 0, 0, 0);
  const mailer = new MemoryMailer();
  const deps: Deps = {
    config: testConfig(),
    db: openDb(":memory:"),
    mailer,
    limits: makeLimits(),
    parser: null,
    now: () => clock,
    ...overrides,
  };
  const app = createApp(deps);
  return {
    app,
    deps,
    mailer,
    advance(ms: number) {
      clock += ms;
    },
    client: () => new Client(app),
  };
}

/** A tiny browser: keeps cookies and sends the CSRF token on forms. */
export class Client {
  cookies = new Map<string, string>();
  constructor(private app: ReturnType<typeof createApp>) {}

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private store(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair = ""] = sc.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      if (/max-age=0/i.test(sc) || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async get(path: string, headers: Record<string, string> = {}) {
    const res = await this.app.request(path, { headers: { cookie: this.cookieHeader(), ...headers } });
    this.store(res);
    return res;
  }

  /** Posts a form, adding _csrf automatically (fetching a page first if needed). */
  async post(path: string, fields: Record<string, string | string[]> = {}, opts: { csrf?: boolean; headers?: Record<string, string> } = {}) {
    if (opts.csrf !== false && !this.cookies.has("csrf")) await this.get("/login");
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) {
      for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
    }
    if (opts.csrf !== false && !("_csrf" in fields)) body.set("_csrf", this.cookies.get("csrf") ?? "");
    const res = await this.app.request(path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: this.cookieHeader(), ...opts.headers },
      body,
    });
    this.store(res);
    return res;
  }

  async postJson(path: string, data: unknown) {
    if (!this.cookies.has("csrf")) await this.get("/login");
    const res = await this.app.request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-csrf-token": this.cookies.get("csrf") ?? "",
        cookie: this.cookieHeader(),
      },
      body: JSON.stringify(data),
    });
    this.store(res);
    return res;
  }
}

export function linkFrom(mailText: string): { token: string; path: string } {
  const m = mailText.match(/https?:\/\/[^\s]+/);
  if (!m) throw new Error("no link in mail");
  const url = new URL(m[0]);
  return { token: url.searchParams.get("token")!, path: url.pathname + url.search };
}

export async function signIn(t: ReturnType<typeof setup>, email = ROBIN) {
  const client = t.client();
  await client.post("/login", { email });
  const mail = t.mailer.sent.at(-1)!;
  const { token } = linkFrom(mail.text);
  const res = await client.post("/auth/verify", { token, next: "/meals" });
  if (res.status !== 303) throw new Error(`sign in failed: ${res.status}`);
  return client;
}
