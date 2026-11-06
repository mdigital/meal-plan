import type { Context } from "hono";
import type { Config } from "./config.js";
import type { Db } from "./db/index.js";
import type { User } from "./db/schema.js";
import type { Mailer } from "./lib/mailer.js";
import type { RateLimiter } from "./auth/rate-limit.js";
import type { RecipeParser } from "./ai/parser.js";

export type Deps = {
  config: Config;
  db: Db;
  mailer: Mailer;
  limits: { loginPerEmail: RateLimiter; loginPerIp: RateLimiter; verifyPerIp: RateLimiter };
  parser: RecipeParser | null;
  now: () => number;
};

export type AppEnv = {
  Variables: {
    deps: Deps;
    user: User | null;
    csrf: string;
  };
};

export type Ctx = Context<AppEnv>;

export function clientIp(c: Context): string {
  return (
    c.req.header("fly-client-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}
