import { Hono } from "hono";
import type { AppEnv } from "../context.js";
import { CATEGORIES, CATEGORY_LABELS } from "../db/schema.js";
import { parseFoodForm } from "../lib/forms.js";
import { createFood, deleteFood, foodMacros, getFood, listFoods, updateFood, type FoodInput } from "../services/meals.js";
import { Csrf, Layout } from "../views/layout.js";
import { Errors, MacroLine } from "../views/components.js";
import { fmtG } from "../lib/nutrition.js";

export const foodRoutes = new Hono<AppEnv>();

const blankFood: FoodInput = {
  name: "",
  unit: "g",
  defaultAmount: 100,
  kcalPer100: 0,
  proteinPer100: 0,
  fibrePer100: 0,
  category: "other",
  notes: "",
};

const v = (n: number) => String(Math.round(n * 10) / 10);

function FoodForm(props: { action: string; csrf: string; food: FoodInput; errors?: string[]; submitLabel: string; cancelHref: string }) {
  const f = props.food;
  return (
    <form method="post" action={props.action} class="stack">
      <Csrf token={props.csrf} />
      <Errors errors={props.errors} />
      <div class="field">
        <label for="name">Name</label>
        <input id="name" name="name" required value={f.name} placeholder="e.g. Kalo Greek yoghurt" />
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="unit">Measured in</label>
          <select id="unit" name="unit">
            <option value="g" selected={f.unit === "g"}>
              grams (g)
            </option>
            <option value="ml" selected={f.unit === "ml"}>
              millilitres (ml)
            </option>
          </select>
        </div>
        <div class="field">
          <label for="default_amount">Usual amount</label>
          <input id="default_amount" name="default_amount" inputmode="decimal" value={v(f.defaultAmount)} />
        </div>
      </div>
      <h2>Nutrition per 100 {f.unit}</h2>
      <div class="grid-3">
        <div class="field">
          <label for="kcal">kcal</label>
          <input id="kcal" name="kcal" inputmode="decimal" value={v(f.kcalPer100)} />
        </div>
        <div class="field">
          <label for="protein">Protein g</label>
          <input id="protein" name="protein" inputmode="decimal" value={v(f.proteinPer100)} />
        </div>
        <div class="field">
          <label for="fibre">Fibre g</label>
          <input id="fibre" name="fibre" inputmode="decimal" value={v(f.fibrePer100)} />
        </div>
      </div>
      <div class="field">
        <label for="category">Shopping category</label>
        <select id="category" name="category">
          {CATEGORIES.map((c) => (
            <option value={c} selected={c === f.category}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label for="notes">Notes</label>
        <textarea id="notes" name="notes" class="short">{f.notes}</textarea>
      </div>
      <div class="row">
        <button type="submit">{props.submitLabel}</button>
        <a class="btn secondary" href={props.cancelHref}>
          Cancel
        </a>
      </div>
    </form>
  );
}

function foodId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : -1;
}

foodRoutes.get("/foods", (c) => {
  const foods = listFoods(c.var.deps.db);
  return c.html(
    <Layout title="Foods" user={c.var.user} tab="meals">
      <p class="small">
        <a href="/meals">← Meals</a>
      </p>
      <div class="row spread">
        <h1>Foods</h1>
        <a class="btn small" href="/foods/new">
          + New food
        </a>
      </div>
      <p class="small muted">Single items like yoghurt or whey, for quick snacks and breakfasts.</p>
      <div class="cards">
        {foods.length === 0 ? <p class="muted">No foods yet.</p> : null}
        {foods.map((f) => (
          <a class="card card-link" href={`/foods/${f.id}/edit`}>
            <h3>{f.name}</h3>
            <p class="small muted">
              Usual amount {fmtG(f.defaultAmount)} {f.unit}:
            </p>
            <MacroLine m={foodMacros(f, f.defaultAmount)} class="small" />
          </a>
        ))}
      </div>
    </Layout>,
  );
});

foodRoutes.get("/foods/new", (c) =>
  c.html(
    <Layout title="New food" user={c.var.user} tab="meals">
      <h1>New food</h1>
      <FoodForm action="/foods" csrf={c.var.csrf} food={blankFood} submitLabel="Save food" cancelHref="/foods" />
    </Layout>,
  ),
);

foodRoutes.post("/foods", async (c) => {
  const parsed = parseFoodForm(await c.req.parseBody());
  if (!parsed.ok) {
    return c.html(
      <Layout title="New food" user={c.var.user} tab="meals">
        <h1>New food</h1>
        <FoodForm action="/foods" csrf={c.var.csrf} food={parsed.draft} errors={parsed.errors} submitLabel="Save food" cancelHref="/foods" />
      </Layout>,
      400,
    );
  }
  createFood(c.var.deps.db, parsed.value, c.var.user!.id);
  return c.redirect("/foods", 303);
});

foodRoutes.get("/foods/:id/edit", (c) => {
  const food = getFood(c.var.deps.db, foodId(c.req.param("id")));
  if (!food) return c.notFound();
  return c.html(
    <Layout title={`Edit ${food.name}`} user={c.var.user} tab="meals">
      <h1>Edit food</h1>
      <FoodForm action={`/foods/${food.id}`} csrf={c.var.csrf} food={food} submitLabel="Save changes" cancelHref="/foods" />
      <form method="post" action={`/foods/${food.id}/delete`} data-confirm={`Delete "${food.name}"?`} class="mt">
        <Csrf token={c.var.csrf} />
        <button class="danger small" type="submit">
          Delete food
        </button>
      </form>
    </Layout>,
  );
});

foodRoutes.post("/foods/:id", async (c) => {
  const food = getFood(c.var.deps.db, foodId(c.req.param("id")));
  if (!food) return c.notFound();
  const parsed = parseFoodForm(await c.req.parseBody());
  if (!parsed.ok) {
    return c.html(
      <Layout title={`Edit ${food.name}`} user={c.var.user} tab="meals">
        <h1>Edit food</h1>
        <FoodForm action={`/foods/${food.id}`} csrf={c.var.csrf} food={parsed.draft} errors={parsed.errors} submitLabel="Save changes" cancelHref="/foods" />
      </Layout>,
      400,
    );
  }
  updateFood(c.var.deps.db, food.id, parsed.value);
  return c.redirect("/foods", 303);
});

foodRoutes.post("/foods/:id/delete", (c) => {
  deleteFood(c.var.deps.db, foodId(c.req.param("id")));
  return c.redirect("/foods", 303);
});
