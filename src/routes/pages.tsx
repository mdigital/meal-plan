import { Hono } from "hono";
import type { AppEnv } from "../context.js";
import { Csrf, Layout } from "../views/layout.js";

export const pageRoutes = new Hono<AppEnv>();

pageRoutes.get("/meals", (c) =>
  c.html(
    <Layout title="Meals" user={c.var.user} tab="meals">
      <h1>Meals</h1>
      <p>Signed in as {c.var.user!.name}.</p>
    </Layout>,
  ),
);

pageRoutes.get("/settings", (c) =>
  c.html(
    <Layout title="Settings" user={c.var.user} tab="settings">
      <h1>Settings</h1>
      <form method="post" action="/logout">
        <Csrf token={c.var.csrf} />
        <button class="secondary" type="submit">
          Sign out
        </button>
      </form>
    </Layout>,
  ),
);
