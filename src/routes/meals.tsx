import { Hono } from "hono";
import type { AppEnv } from "../context.js";
import { SLOT_LABELS, type Slot } from "../db/schema.js";
import { parseMealForm, str } from "../lib/forms.js";
import { createMeal, deleteMeal, getMeal, rescaleMeal, scaledRecipe, updateMeal, type MealInput } from "../services/meals.js";
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
  const wanted = parseServes(c.req.query("serves"));
  const previewing = wanted != null && wanted !== meal.servingsInRecipe;
  const serves = previewing ? wanted : meal.servingsInRecipe;
  const shown = previewing ? scaledRecipe(meal, wanted) : { ingredients: meal.ingredients, method: meal.method };
  const quick = [...new Set([1, 2, 4, 6, meal.servingsInRecipe])].sort((a, b) => a - b);
  return c.html(
    <Layout title={meal.name} user={c.var.user} tab="meals">
      {c.req.query("rescaled") ? (
        <div class="flash" role="status">
          Recipe saved for {fmtG(meal.servingsInRecipe)} serves.
        </div>
      ) : null}
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
        <a class="btn secondary" href={`/shopping/new?meal=${meal.id}`}>
          Shop
        </a>
      </div>

      {meal.ingredients.length || meal.method ? (
        <section class="card mt" aria-labelledby="serves-h" id="serves">
          <div class="row spread">
            <h2 id="serves-h" class="mt0">
              Serves {fmtG(serves)}
            </h2>
            <nav class="row" aria-label="Show the recipe for">
              {quick.map((n) => (
                <a
                  class={`btn small ${n === serves ? "" : "secondary"}`}
                  href={n === meal.servingsInRecipe ? `/meals/${meal.id}#serves` : `/meals/${meal.id}?serves=${n}#serves`}
                  aria-current={n === serves ? "true" : undefined}
                  aria-label={`Serves ${n}`}
                >
                  {fmtG(n)}
                </a>
              ))}
            </nav>
          </div>
          <form method="get" action={`/meals/${meal.id}#serves`} class="row mt-s">
            <label for="serves-input" class="small">
              Other
            </label>
            <input id="serves-input" name="serves" type="number" inputmode="decimal" min="0.5" max="50" step="0.5" value={fmtG(serves)} class="serves-input" />
            <button type="submit" class="secondary small">
              Show
            </button>
          </form>
          {previewing ? (
            <div class="notice small mt-s" role="status">
              Showing amounts for {fmtG(serves)} serves. The saved recipe serves {fmtG(meal.servingsInRecipe)}. Nutrition per serve
              doesn't change.
              <form method="post" action={`/meals/${meal.id}/scale`} class="row mt-s">
                <Csrf token={c.var.csrf} />
                <input type="hidden" name="servings" value={String(serves)} />
                <button type="submit" class="small">
                  Save recipe as serves {fmtG(serves)}
                </button>
                <a class="btn secondary small" href={`/meals/${meal.id}#serves`}>
                  Cancel
                </a>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}

      {shown.ingredients.length ? (
        <section>
          <h2>Ingredients</h2>
          <ul class="ingredients">
            {shown.ingredients.map((i) => (
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

      {shown.method ? (
        <section>
          <h2>Method</h2>
          <div class="prewrap">{shown.method}</div>
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

      {meal.source.trim() ? (
        <form method="post" action={`/meals/${meal.id}/reestimate`}>
          <Csrf token={c.var.csrf} />
          <button type="submit" class="secondary small" data-busy="Estimating…">
            Re-estimate nutrition with AI
          </button>
        </form>
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

/** Accepts 0.5 to 50 serves in half-serve steps. */
export function parseServes(raw: string | undefined): number | null {
  const n = Number((raw ?? "").replace(",", "."));
  if (!raw || !Number.isFinite(n) || n < 0.5 || n > 50) return null;
  return Math.round(n * 2) / 2;
}

mealRoutes.post("/meals/:id/scale", async (c) => {
  const { db } = c.var.deps;
  const id = mealId(c.req.param("id"));
  const servings = parseServes(str(await c.req.parseBody(), "servings"));
  if (servings == null) return c.redirect(`/meals/${id}#serves`, 303);
  if (!rescaleMeal(db, id, servings)) return c.notFound();
  return c.redirect(`/meals/${id}?rescaled=1#serves`, 303);
});

mealRoutes.post("/meals/:id/delete", (c) => {
  deleteMeal(c.var.deps.db, mealId(c.req.param("id")));
  return c.redirect("/meals?deleted=1", 303);
});
