import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { Layout } from "./views/layout.js";

export function createApp() {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  app.use("/*", serveStatic({ root: "./public" }));

  app.get("/", (c) =>
    c.html(
      <Layout title="Home">
        <h1>Meals</h1>
        <p>Hello from the meal planner.</p>
      </Layout>,
    ),
  );

  return app;
}
