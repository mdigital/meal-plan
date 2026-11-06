import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../context.js";
import { newToken, safeEqual, userForSession, SESSION_TTL_MS } from "./tokens.js";

export const SESSION_COOKIE = "sid";
export const CSRF_COOKIE = "csrf";
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string, secure: boolean) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Parameters<typeof deleteCookie>[0], secure: boolean) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure });
}

/** Loads the signed-in user (if any) into c.var.user. */
export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const { db, now } = c.var.deps;
  const token = getCookie(c, SESSION_COOKIE);
  c.set("user", token ? userForSession(db, token, now()) : null);
  await next();
});

/**
 * Double-submit CSRF protection. Every visitor gets a random "csrf" cookie;
 * every unsafe request must echo it in the _csrf form field or the
 * x-csrf-token header. Also rejects cross-origin requests by Origin header.
 */
export const csrfProtection = createMiddleware<AppEnv>(async (c, next) => {
  const { config } = c.var.deps;
  let token = getCookie(c, CSRF_COOKIE);
  if (!token || token.length < 20) {
    token = newToken(24);
    setCookie(c, CSRF_COOKIE, token, {
      httpOnly: true,
      secure: config.production,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  c.set("csrf", token);

  if (UNSAFE.has(c.req.method)) {
    const origin = c.req.header("origin");
    const fetchSite = c.req.header("sec-fetch-site");
    const sameOriginFetch = fetchSite === "same-origin";
    if (fetchSite === "cross-site" || (origin && !sameOriginFetch && !sameSite(origin, c.req.header("host"), config.appUrl))) {
      throw new HTTPException(403, { message: "Cross-origin request blocked" });
    }
    let sent = c.req.header("x-csrf-token");
    if (!sent) {
      const type = c.req.header("content-type") ?? "";
      if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
        const body = await c.req.parseBody();
        const v = body["_csrf"];
        sent = typeof v === "string" ? v : undefined;
      }
    }
    if (!sent || !getCookie(c, CSRF_COOKIE) || !safeEqual(sent, token)) {
      throw new HTTPException(403, { message: "Your session form expired. Go back, reload the page and try again." });
    }
  }
  await next();
});

/**
 * True if the Origin header matches APP_URL or this request's Host. Compares
 * hosts, not full origins, because behind Fly's proxy the app sees http://
 * while the browser sends https://.
 */
export function sameSite(origin: string, host: string | undefined, appUrl: string): boolean {
  if (origin === "null") return false;
  try {
    const o = new URL(origin);
    return o.origin === new URL(appUrl).origin || (!!host && o.host === host);
  } catch {
    return false;
  }
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) {
    if (c.req.method === "GET") {
      const next = encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search);
      return c.redirect(`/login?next=${next}`);
    }
    throw new HTTPException(401, { message: "Please sign in" });
  }
  await next();
});
