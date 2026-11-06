import { Hono } from "hono";
import { and, count, eq, gt } from "drizzle-orm";
import type { AppEnv, Ctx } from "../context.js";
import type { Db } from "../db/index.js";
import { aiImports } from "../db/schema.js";
import { aiRecipeToMeal, MAX_RECIPE_CHARS, RecipeParseError } from "../ai/parser.js";
import { getMeal } from "../services/meals.js";
import { str } from "../lib/forms.js";
import { Csrf, Layout } from "../views/layout.js";
import { Errors } from "../views/components.js";
import { MealForm } from "../views/meal-form.js";

export const importRoutes = new Hono<AppEnv>();

const DAY_MS = 24 * 60 * 60 * 1000;

export function importsUsed(db: Db, userId: number, now: number): number {
  const row = db
    .select({ n: count() })
    .from(aiImports)
    .where(and(eq(aiImports.userId, userId), gt(aiImports.createdAt, new Date(now - DAY_MS))))
    .get();
  return row?.n ?? 0;
}

function ImportPage(props: { c: Ctx; text?: string; errors?: string[] }) {
  const { c } = props;
  const { db, config, parser, now } = c.var.deps;
  const left = Math.max(0, config.aiDailyCap - importsUsed(db, c.var.user!.id, now()));
  return (
    <Layout title="Add a meal" user={c.var.user} tab="meals">
      <h1>Add a meal</h1>
      <Errors errors={props.errors} />
      {!parser ? (
        <div class="notice">AI import isn't set up yet (no Anthropic API key). You can still add meals by hand.</div>
      ) : (
        <form method="post" action="/import" class="stack">
          <Csrf token={c.var.csrf} />
          <div class="field">
            <label for="recipe">Paste a recipe</label>
            <textarea id="recipe" name="recipe" required maxlength={MAX_RECIPE_CHARS} placeholder="Ingredients and method, as text. Any units are fine.">
              {props.text ?? ""}
            </textarea>
            <p class="small muted">
              AI estimates the ingredients and nutrition. You can check and change everything before saving. Only this text is
              sent. {left} of {config.aiDailyCap} imports left in the last 24 hours.
            </p>
          </div>
          <button type="submit" disabled={left === 0} data-busy="Estimating… this takes up to 30 seconds">
            Estimate nutrition
          </button>
        </form>
      )}
      <p class="mt">
        <a class="btn secondary" href="/meals/new">
          Enter by hand instead
        </a>
      </p>
    </Layout>
  );
}

importRoutes.get("/import", (c) => c.html(<ImportPage c={c} />));

/** Runs the parser with cap checks. Returns the meal draft or an error message for the user. */
async function runImport(c: Ctx, text: string) {
  const { db, config, parser, now } = c.var.deps;
  const userId = c.var.user!.id;
  if (!parser) return { error: "AI import isn't set up yet." } as const;
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return { error: "Paste a recipe first." } as const;
  if (trimmed.length > MAX_RECIPE_CHARS) return { error: `That's too long. Keep it under ${MAX_RECIPE_CHARS.toLocaleString("en-NZ")} characters.` } as const;
  if (importsUsed(db, userId, now()) >= config.aiDailyCap) {
    return { error: `You've used all ${config.aiDailyCap} AI imports for the last 24 hours. Add the meal by hand, or try again tomorrow.` } as const;
  }
  const attempt = db.insert(aiImports).values({ userId, createdAt: new Date(now()) }).returning({ id: aiImports.id }).get();
  try {
    const ai = await parser.parse(trimmed);
    db.update(aiImports).set({ ok: true }).where(eq(aiImports.id, attempt.id)).run();
    if (!ai.is_recipe) return { error: "That doesn't look like a recipe. Paste the ingredients and method." } as const;
    return { meal: aiRecipeToMeal(ai, trimmed) } as const;
  } catch (err) {
    console.error("[import] parse failed", err);
    return { error: err instanceof RecipeParseError ? err.userMessage : "Something went wrong reading that recipe. Try again." } as const;
  }
}

importRoutes.post("/import", async (c) => {
  const text = str(await c.req.parseBody(), "recipe");
  const result = await runImport(c, text);
  if ("error" in result) return c.html(<ImportPage c={c} text={text} errors={[result.error!]} />, 422);
  return c.html(
    <Layout title="Check the meal" user={c.var.user} tab="meals">
      <h1>Check the meal</h1>
      <p class="small muted">Nothing is saved until you tap Save.</p>
      <MealForm action="/meals" csrf={c.var.csrf} meal={result.meal} statusFrom="ai_estimate" submitLabel="Save meal" cancelHref="/import" />
    </Layout>,
  );
});

/** Re-runs the estimate on a meal's stored recipe text and opens it for review. */
importRoutes.post("/meals/:id/reestimate", async (c) => {
  const meal = getMeal(c.var.deps.db, Number(c.req.param("id")) || -1);
  if (!meal) return c.notFound();
  if (!meal.source.trim()) {
    return c.redirect(`/meals/${meal.id}/edit`, 303);
  }
  const result = await runImport(c, meal.source);
  if ("error" in result) {
    return c.html(
      <Layout title={meal.name} user={c.var.user} tab="meals">
        <h1>Couldn't re-estimate</h1>
        <Errors errors={[result.error!]} />
        <a class="btn" href={`/meals/${meal.id}`}>
          Back to the meal
        </a>
      </Layout>,
      422,
    );
  }
  const draft = { ...result.meal, name: meal.name, notes: meal.notes, tags: meal.tags.length ? meal.tags : result.meal.tags };
  return c.html(
    <Layout title="Check the new estimate" user={c.var.user} tab="meals">
      <h1>Check the new estimate</h1>
      <p class="small muted">The meal keeps its old numbers until you tap Save.</p>
      <MealForm action={`/meals/${meal.id}`} csrf={c.var.csrf} meal={draft} statusFrom="ai_estimate" submitLabel="Save new estimate" cancelHref={`/meals/${meal.id}`} />
    </Layout>,
  );
});
