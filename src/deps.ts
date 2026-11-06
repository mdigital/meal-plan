import { loadConfig, type Config } from "./config.js";
import type { Deps } from "./context.js";
import { openDb } from "./db/index.js";
import { RateLimiter } from "./auth/rate-limit.js";
import { createMailer } from "./lib/mailer.js";
import { AnthropicRecipeParser } from "./ai/parser.js";

export function makeLimits() {
  return {
    loginPerEmail: new RateLimiter(5, 15 * 60 * 1000),
    loginPerIp: new RateLimiter(20, 15 * 60 * 1000),
    verifyPerIp: new RateLimiter(30, 15 * 60 * 1000),
  };
}

export function buildDeps(config: Config = loadConfig()): Deps {
  return {
    config,
    db: openDb(config.databasePath),
    mailer: createMailer(config),
    limits: makeLimits(),
    parser: config.anthropicApiKey ? new AnthropicRecipeParser(config.anthropicApiKey) : null,
    now: Date.now,
  };
}
