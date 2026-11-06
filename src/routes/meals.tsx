import { Hono } from "hono";
import type { AppEnv } from "../context.js";
import { SLOT_LABELS, type Slot } from "../db/schema.js";
import { parseMealForm } from "../lib/forms.js";
import { createMeal, deleteMeal, getMeal, updateMeal, type MealInput } from "../services/meals.js";
import { Csrf, Layout } from "../views/layout.js";
import { MealForm } from "../views/meal-form.js";
import { MacroLine, StatusBadge } from "../views/components.js";
import { fmtG } from "../lib/nutrition.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const mealRoutes = new Hono<AppEnv>();

export function emptyMeal(slot: Slot = "dinner"): MealInput {
  return {
    name: "",
    slot,
    tags: [],
    servingsInRecipe: 2,
    method: "",
    source: "",
    kcal: 0,
    proteinG: 0,
    fibreG: 0,
    nutritionStatus: "manual",
    assumptions: [],
    notes: "",
    ingredients: [],
  };
}

function mealId(raw: string): number {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : -1;
}

mealRoutes.get("/meals/new", (c) => {
  const slot = (c.req.query("slot") as Slot) in SLOT_LABELS ? (c.req.query("slot") as Slot) : "dinner";
  return c.html(
    <Layout title="New meal" user={c.var.user} tab="meals">
      <h1>New meal</h1>
      <p class="small muted">
        Have a recipe? <a href="/import">Paste it and let AI estimate the nutrition</a>.
      </p>
      <MealForm action="/meals" csrf={c.var.csrf} meal={emptyMeal(slot)} statusFrom="manual" submitLabel="Save meal" cancelHref="/meals" />
    </Layout>,
  );
});

mealRoutes.post("/meals", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const parsed = parseMealForm(body);
  if (!parsed.ok) {
    return c.html(
      <Layout title="New meal" user={c.var.user} tab="meals">
        <h1>New meal</h1>
        <MealForm
          action="/meals"
          csrf={c.var.csrf}
          meal={parsed.draft}
          errors={parsed.errors}
          statusFrom="manual"
          submitLabel="Save meal"
          cancelHref="/meals"
        />
      </Layout>,
      400,
    );
  }
  const id = createMeal(c.var.deps.db, parsed.value, c.var.user!.id);
  return c.redirect(`/meals/${id}?saved=1`, 303);
});

mealRoutes.get("/meals/:id", (c) => {
  const { db } = c.var.deps;
  const meal = getMeal(db, mealId(c.req.param("id")));
  if (!meal) return c.notFound();
  const author = meal.createdByUserId ? db.select().from(users).where(eq(users.id, meal.createdByUserId)).get() : null;
  return c.html(
    <Layout title={meal.name} user={c.var.user} tab="meals">
      {c.req.query("saved") ? (
        <div class="flash" role="status">
          Saved.
        </div>
      ) : null}
      <p class="small">
        <a href="/meals">← All meals</a>
      </p>
      <h1>{meal.name}</h1>
      <div class="row small">
        <span class="pill">{SLOT_LABELS[meal.slot]}</span>
        {meal.tags.map((t) => (
          <a class="pill" href={`/meals?tag=${encodeURIComponent(t)}`}>
            {t}
          </a>
        ))}
        <StatusBadge status={meal.nutritionStatus} />
      </div>

      <section class="card" aria-labelledby="nut-h">
        <h2 id="nut-h" class="mt0">
          Per serve
        </h2>
        <MacroLine m={meal} />
        <p class="small muted">
          Recipe serves {fmtG(meal.servingsInRecipe)}.
          {meal.nutritionStatus !== "manual" ? " Nutrition is an estimate." : ""}
        </p>
      </section>

      <div class="row">
        <a class="btn" href={`/days/add?meal=${meal.id}`}>
          Add to a day
        </a>
        <a class="btn secondary" href={`/meals/${meal.id}/edit`}>
          Edit
        </a>
      </div>

      {meal.ingredients.length ? (
        <section>
          <h2>Ingredients</h2>
          <ul class="ingredients">
            {meal.ingredients.map((i) => (
              <li>
                {i.quantity != null ? (
                  <b>
                    {fmtG(i.quantity)}
                    {i.unit === "whole" ? "" : ` ${i.unit}`}{" "}
                  </b>
                ) : null}
                {i.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {meal.method ? (
        <section>
          <h2>Method</h2>
          <div class="prewrap">{meal.method}</div>
        </section>
      ) : null}

      {meal.notes ? (
        <section>
          <h2>Notes</h2>
          <div class="prewrap">{meal.notes}</div>
        </section>
      ) : null}

      {meal.assumptions.length ? (
        <details class="small">
          <summary>Estimate assumptions</summary>
          <ul>
            {meal.assumptions.map((a) => (
              <li>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <p class="small muted">Added by {author?.name ?? "someone"}. Shared with the household.</p>

      <form method="post" action={`/meals/${meal.id}/delete`} data-confirm={`Delete "${meal.name}"? This can't be undone.`}>
        <Csrf token={c.var.csrf} />
        <button type="submit" class="danger small">
          Delete meal
        </button>
      </form>
    </Layout>,
  );
});

mealRoutes.get("/meals/:id/edit", (c) => {
  const meal = getMeal(c.var.deps.db, mealId(c.req.param("id")));
  if (!meal) return c.notFound();
  return c.html(
    <Layout title={`Edit ${meal.name}`} user={c.var.user} tab="meals">
      <h1>Edit meal</h1>
      <MealForm
        action={`/meals/${meal.id}`}
        csrf={c.var.csrf}
        meal={meal}
        statusFrom={meal.nutritionStatus}
        submitLabel="Save changes"
        cancelHref={`/meals/${meal.id}`}
      />
    </Layout>,
  );
});

mealRoutes.post("/meals/:id", async (c) => {
  const { db } = c.var.deps;
  const meal = getMeal(db, mealId(c.req.param("id")));
  if (!meal) return c.notFound();
  const body = await c.req.parseBody({ all: true });
  const parsed = parseMealForm(body);
  if (!parsed.ok) {
    return c.html(
      <Layout title={`Edit ${meal.name}`} user={c.var.user} tab="meals">
        <h1>Edit meal</h1>
        <MealForm
          action={`/meals/${meal.id}`}
          csrf={c.var.csrf}
          meal={parsed.draft}
          errors={parsed.errors}
          statusFrom={meal.nutritionStatus}
          submitLabel="Save changes"
          cancelHref={`/meals/${meal.id}`}
        />
      </Layout>,
      400,
    );
  }
  updateMeal(db, meal.id, parsed.value);
  return c.redirect(`/meals/${meal.id}?saved=1`, 303);
});

mealRoutes.post("/meals/:id/delete", (c) => {
  deleteMeal(c.var.deps.db, mealId(c.req.param("id")));
  return c.redirect("/meals?deleted=1", 303);
});
