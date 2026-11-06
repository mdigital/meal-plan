import { Hono } from "hono";
import type { AppEnv } from "../context.js";
import { listMeals } from "../services/meals.js";
import { Csrf, Layout } from "../views/layout.js";
import { MealCard } from "../views/components.js";

export const pageRoutes = new Hono<AppEnv>();

pageRoutes.get("/meals", (c) => {
  const meals = listMeals(c.var.deps.db);
  return c.html(
    <Layout title="Meals" user={c.var.user} tab="meals">
      <div class="row spread">
        <h1>Meals</h1>
        <div class="row">
          <a class="btn small secondary" href="/foods">
            Foods
          </a>
          <a class="btn small" href="/meals/new">
            + New
          </a>
        </div>
      </div>
      <div class="cards">
        {meals.map((m) => (
          <MealCard meal={m} />
        ))}
      </div>
    </Layout>,
  );
});

pageRoutes.get("/settings", (c) =>
  c.html(
    <Layout title="Settings" user={c.var.user} tab="settings">
      <h1>Settings</h1>
      <p>Signed in as {c.var.user!.name}.</p>
      <form method="post" action="/logout">
        <Csrf token={c.var.csrf} />
        <button class="secondary" type="submit">
          Sign out
        </button>
      </form>
    </Layout>,
  ),
);
