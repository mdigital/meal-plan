import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { clientIp, type AppEnv } from "../context.js";
import { normaliseEmail } from "../config.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { consumeLoginToken, createLoginToken, createSession, deleteSession } from "../auth/tokens.js";
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from "../auth/middleware.js";
import { magicLinkMail } from "../lib/mailer.js";
import { Csrf, Layout } from "../views/layout.js";

/** Only allow same-site relative redirects. */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/meals";
  return next;
}

export const authRoutes = new Hono<AppEnv>();

function LoginPage(props: { csrf: string; next: string; sent?: boolean; error?: string; email?: string }) {
  return (
    <Layout title="Sign in">
      <h1>Sign in</h1>
      {props.sent ? (
        <div class="flash" role="status">
          <p>
            <b>Check your email.</b> If that address is allowed to use Meals, a sign-in link is on its way. It expires
            in 15 minutes.
          </p>
        </div>
      ) : null}
      {props.error ? (
        <div class="flash error" role="alert">
          {props.error}
        </div>
      ) : null}
      <form method="post" action="/login" class="card">
        <Csrf token={props.csrf} />
        <input type="hidden" name="next" value={props.next} />
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" inputmode="email" required value={props.email ?? ""} />
        </div>
        <button type="submit" data-busy="Sending…">Email me a sign-in link</button>
      </form>
    </Layout>
  );
}

authRoutes.get("/login", (c) => {
  if (c.var.user) return c.redirect(safeNext(c.req.query("next")));
  return c.html(<LoginPage csrf={c.var.csrf} next={safeNext(c.req.query("next"))} />);
});

authRoutes.post("/login", async (c) => {
  const { db, config, mailer, limits, now } = c.var.deps;
  const body = await c.req.parseBody();
  const next = safeNext(typeof body.next === "string" ? body.next : undefined);
  const parsed = z.string().email().max(254).safeParse(typeof body.email === "string" ? body.email.trim() : "");
  if (!parsed.success) {
    return c.html(<LoginPage csrf={c.var.csrf} next={next} error="Enter a valid email address." />, 400);
  }
  const email = normaliseEmail(parsed.data);
  const ip = clientIp(c);

  // Check both limits on every request so neither leaks whether the email is allowed.
  const ipOk = limits.loginPerIp.hit(ip, now());
  const emailOk = limits.loginPerEmail.hit(email, now());
  if (!ipOk || !emailOk) {
    return c.html(
      <LoginPage csrf={c.var.csrf} next={next} email={email} error="Too many sign-in requests. Wait a few minutes and try again." />,
      429,
    );
  }

  const allowed = config.allowedUsers.some((u) => u.email === email);
  if (allowed) {
    const token = createLoginToken(db, email, now());
    const link = `${config.appUrl}/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
    try {
      await mailer.send(magicLinkMail(email, link));
    } catch (err) {
      console.error("[auth] failed to send magic link", err);
    }
  }
  // Same response whether or not the email is on the allowlist.
  return c.html(<LoginPage csrf={c.var.csrf} next={next} sent />);
});

/**
 * The link in the email lands on a confirmation page. Consuming the token
 * needs a POST, so email security scanners that prefetch links can't burn it.
 */
authRoutes.get("/auth/verify", (c) => {
  const token = c.req.query("token") ?? "";
  const next = safeNext(c.req.query("next"));
  return c.html(
    <Layout title="Sign in">
      <h1>Sign in to Meals</h1>
      <form method="post" action="/auth/verify" class="card">
        <Csrf token={c.var.csrf} />
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="next" value={next} />
        <p>Tap to finish signing in on this device.</p>
        <button type="submit">Sign in</button>
      </form>
    </Layout>,
  );
});

authRoutes.post("/auth/verify", async (c) => {
  const { db, config, limits, now } = c.var.deps;
  const body = await c.req.parseBody();
  const token = typeof body.token === "string" ? body.token : "";
  const next = safeNext(typeof body.next === "string" ? body.next : undefined);

  if (!limits.verifyPerIp.hit(clientIp(c), now())) {
    return c.html(<LoginPage csrf={c.var.csrf} next={next} error="Too many attempts. Wait a few minutes and try again." />, 429);
  }

  const email = token ? consumeLoginToken(db, token, now()) : null;
  const allowedUser = email ? config.allowedUsers.find((u) => u.email === email) : undefined;
  if (!email || !allowedUser) {
    return c.html(
      <LoginPage csrf={c.var.csrf} next={next} error="That sign-in link has expired or was already used. Request a new one." />,
      400,
    );
  }

  let user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    user = db.insert(users).values({ email, name: allowedUser.name }).returning().get();
  }
  const session = createSession(db, user.id, now());
  setSessionCookie(c, session.token, config.production);
  return c.redirect(next, 303);
});

authRoutes.post("/logout", (c) => {
  const { db, config } = c.var.deps;
  const token = getCookie(c, SESSION_COOKIE);
  if (token) deleteSession(db, token);
  clearSessionCookie(c, config.production);
  return c.redirect("/login", 303);
});
