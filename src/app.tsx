import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Deps } from "./context.js";
import { csrfProtection, loadSession, requireUser } from "./auth/middleware.js";
import { authRoutes } from "./routes/auth.js";
import { Layout } from "./views/layout.js";
import { pageRoutes } from "./routes/pages.js";
import { mealRoutes } from "./routes/meals.js";
import { foodRoutes } from "./routes/foods.js";
import { importRoutes } from "./routes/import.js";
import { dayRoutes } from "./routes/days.js";

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.get("/healthz", (c) => c.text("ok"));

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
      // "no-referrer" makes browsers send Origin: null on form posts, which breaks the CSRF origin check.
      referrerPolicy: "strict-origin-when-cross-origin",
      strictTransportSecurity: deps.config.production ? "max-age=31536000; includeSubDomains" : false,
    }),
  );

  app.use(
    "/*",
    serveStatic({
      root: "./public",
      onFound: (path, c) => {
        if (path.endsWith("sw.js")) c.header("Cache-Control", "no-cache");
        else c.header("Cache-Control", "public, max-age=3600");
      },
    }),
  );

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });
  app.use("*", loadSession);
  app.use("*", csrfProtection);

  app.route("/", authRoutes);

  app.get("/", (c) => c.redirect(c.var.user ? "/meals" : "/login"));

  app.use("*", requireUser);
  app.route("/", pageRoutes);
  app.route("/", mealRoutes);
  app.route("/", foodRoutes);
  app.route("/", importRoutes);
  app.route("/", dayRoutes);

  app.notFound((c) =>
    c.html(
      <Layout title="Not found" user={c.var.user}>
        <h1>Not found</h1>
        <p>That page doesn't exist.</p>
        <p>
          <a class="btn" href="/meals">
            Back to meals
          </a>
        </p>
      </Layout>,
      404,
    ),
  );

  app.onError((err, c) => {
    const status = err instanceof HTTPException ? err.status : 500;
    if (status >= 500) console.error(err);
    const message = err instanceof HTTPException ? err.message : "Something went wrong on our side. Try again.";
    if (c.req.header("accept")?.includes("application/json")) {
      return c.json({ error: message }, status);
    }
    return c.html(
      <Layout title="Error" user={c.var.user}>
        <h1>{status === 403 ? "Not allowed" : status === 401 ? "Please sign in" : "Something went wrong"}</h1>
        <p>{message}</p>
        <p>
          <a class="btn" href="/">
            Go home
          </a>
        </p>
      </Layout>,
      status,
    );
  });

  return app;
}
