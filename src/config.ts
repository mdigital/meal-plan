export type AllowedUser = { email: string; name: string };

export type Config = {
  production: boolean;
  appUrl: string;
  databasePath: string;
  allowedUsers: AllowedUser[];
  email: {
    from: string;
    sesRegion?: string;
    /** Print magic links to the server log instead of sending them. Never on in production unless forced. */
    logLinks: boolean;
  };
  anthropicApiKey?: string;
  aiDailyCap: number;
};

/**
 * ALLOWED_EMAILS is a comma-separated list. Each entry is an email, optionally
 * followed by ":Display Name", e.g. "robin@example.com:Robin,sam@example.com:Sam".
 */
export function parseAllowedEmails(raw: string | undefined): AllowedUser[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email = "", ...rest] = entry.split(":");
      const normalised = normaliseEmail(email);
      const name = rest.join(":").trim() || normalised.split("@")[0] || normalised;
      return { email: normalised, name };
    });
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const sesRegion = env.SES_REGION || env.AWS_REGION || undefined;
  return {
    production,
    appUrl: (env.APP_URL || `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, ""),
    databasePath: env.DATABASE_PATH || "./data/meals.db",
    allowedUsers: parseAllowedEmails(env.ALLOWED_EMAILS),
    email: {
      from: env.EMAIL_FROM || "Meals <meals@localhost>",
      sesRegion,
      logLinks: env.EMAIL_LOG_LINKS === "1" || (!production && !sesRegion),
    },
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    aiDailyCap: Number(env.AI_DAILY_CAP ?? 20),
  };
}
