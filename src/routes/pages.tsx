import { Hono } from "hono";
import { readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { createBackup } from "../backup.js";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../db/schema.js";
import { addStaple, listStaples, removeStaple } from "../services/shopping.js";
import { num, str } from "../lib/forms.js";
import type { AppEnv } from "../context.js";
import { SLOTS, SLOT_LABELS, type Slot } from "../db/schema.js";
import { allTags, listMeals, type MealQuery, type MealSort } from "../services/meals.js";
import { Csrf, Layout } from "../views/layout.js";
import { MealCard } from "../views/components.js";

export const pageRoutes = new Hono<AppEnv>();

/** Dinner first: it's the slot people browse most. */
const CHIP_SLOTS: Slot[] = ["dinner", "lunch", "breakfast", "morning_tea", "snack", "other"];

const SORTS: { id: MealSort; label: string }[] = [
  { id: "name", label: "A–Z" },
  { id: "protein", label: "Most protein" },
  { id: "fibre", label: "Most fibre" },
  { id: "kcal", label: "Fewest kcal" },
];

function readQuery(q: Record<string, string>): MealQuery {
  const slot = SLOTS.includes(q.slot as Slot) ? (q.slot as Slot) : undefined;
  const sort = SORTS.some((s) => s.id === q.sort) ? (q.sort as MealSort) : "name";
  return { slot, sort, tag: q.tag?.trim() || undefined, q: q.q?.trim().slice(0, 100) || undefined };
}

/** Builds a /meals URL from the current query with some keys changed. */
function href(current: MealQuery, change: Partial<Record<keyof MealQuery, string | undefined>>) {
  const merged: Record<string, string | undefined> = { ...current, ...change };
  if (merged.sort === "name") delete merged.sort;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `/meals?${s}` : "/meals";
}

pageRoutes.get("/meals", (c) => {
  const { db } = c.var.deps;
  const query = readQuery(c.req.query());
  const meals = listMeals(db, query);
  const tags = allTags(db);
  const filtered = !!(query.slot || query.tag || query.q);

  return c.html(
    <Layout title="Meals" user={c.var.user} tab="meals">
      {c.req.query("deleted") ? (
        <div class="flash" role="status">
          Meal deleted.
        </div>
      ) : null}
      <div class="row spread">
        <h1>Meals</h1>
        <div class="row">
          <a class="btn small secondary" href="/foods">
            Foods
          </a>
          <a class="btn small" href="/import">
            + Add
          </a>
        </div>
      </div>

      <form method="get" action="/meals" role="search" class="search">
        {query.slot ? <input type="hidden" name="slot" value={query.slot} /> : null}
        {query.tag ? <input type="hidden" name="tag" value={query.tag} /> : null}
        {query.sort && query.sort !== "name" ? <input type="hidden" name="sort" value={query.sort} /> : null}
        <label for="q" class="sr-only">
          Search meals
        </label>
        <input id="q" name="q" type="search" placeholder="Search meals or ingredients" value={query.q ?? ""} enterkeyhint="search" />
      </form>

      <nav class="chips" aria-label="Filter by slot">
        <a class="chip" href={href(query, { slot: undefined })} aria-current={!query.slot ? "true" : undefined}>
          All
        </a>
        {CHIP_SLOTS.map((s) => (
          <a class="chip" href={href(query, { slot: s })} aria-current={query.slot === s ? "true" : undefined}>
            {SLOT_LABELS[s]}
          </a>
        ))}
      </nav>
      <nav class="chips" aria-label="Sort">
        {SORTS.map((s) => (
          <a class="chip chip-sort" href={href(query, { sort: s.id })} aria-current={query.sort === s.id ? "true" : undefined}>
            {s.label}
          </a>
        ))}
      </nav>
      {tags.length ? (
        <details class="tags-filter" open={!!query.tag}>
          <summary>Tags{query.tag ? `: ${query.tag}` : ""}</summary>
          <nav class="chips wrap" aria-label="Filter by tag">
            {query.tag ? (
              <a class="chip" href={href(query, { tag: undefined })}>
                Any tag
              </a>
            ) : null}
            {tags.map((t) => (
              <a class="chip" href={href(query, { tag: t })} aria-current={query.tag === t ? "true" : undefined}>
                {t}
              </a>
            ))}
          </nav>
        </details>
      ) : null}

      <p class="small muted" aria-live="polite">
        {meals.length} meal{meals.length === 1 ? "" : "s"}
        {filtered ? (
          <>
            {" · "}
            <a href={query.sort && query.sort !== "name" ? `/meals?sort=${query.sort}` : "/meals"}>Clear filters</a>
          </>
        ) : null}
      </p>
      <div class="cards">
        {meals.map((m) => (
          <MealCard meal={m} />
        ))}
      </div>
      {meals.length === 0 ? (
        <div class="card">
          <p>{filtered ? "No meals match." : "No meals yet."}</p>
          <p>
            <a href="/import">Add a meal</a>.
          </p>
        </div>
      ) : null}
    </Layout>,
  );
});

pageRoutes.get("/settings", (c) => {
  const user = c.var.user!;
  const staples = listStaples(c.var.deps.db, user.id);
  return c.html(
    <Layout title="Settings" user={user} tab="settings">
      <h1>Settings</h1>
      {c.req.query("saved") ? (
        <div class="flash" role="status">
          Saved.
        </div>
      ) : null}
      <form method="post" action="/settings/targets" class="card stack">
        <Csrf token={c.var.csrf} />
        <h2 class="mt0">Daily targets</h2>
        <div class="grid-3">
          <div class="field">
            <label for="t-kcal">kcal</label>
            <input id="t-kcal" name="kcal" inputmode="decimal" value={String(user.targetKcal)} />
          </div>
          <div class="field">
            <label for="t-protein">Protein g</label>
            <input id="t-protein" name="protein" inputmode="decimal" value={String(user.targetProteinG)} />
          </div>
          <div class="field">
            <label for="t-fibre">Fibre g</label>
            <input id="t-fibre" name="fibre" inputmode="decimal" value={String(user.targetFibreG)} />
          </div>
        </div>
        <button type="submit">Save targets</button>
      </form>
      <section class="card mt" aria-labelledby="staples-h">
        <h2 id="staples-h" class="mt0">
          Pantry staples
        </h2>
        <p class="small muted">Left off shopping lists unless you choose to show them. Tap one to remove it.</p>
        <ul class="staples">
          {staples.map((s) => (
            <li>
              <form method="post" action={`/settings/staples/${s.id}/delete`}>
                <Csrf token={c.var.csrf} />
                <button type="submit" aria-label={`Remove ${s.name}`}>
                  {s.name} <span aria-hidden="true">✕</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form method="post" action="/settings/staples" class="row">
          <Csrf token={c.var.csrf} />
          <label for="staple" class="sr-only">
            New staple
          </label>
          <input id="staple" name="name" placeholder="e.g. Soy sauce" maxlength={60} required class="grow" />
          <button type="submit">Add</button>
        </form>
      </section>
      <section class="card mt">
        <h2 class="mt0">Backup</h2>
        <p class="small muted">A backup is made every night and emailed to the owner. You can also download one now.</p>
        <a class="btn secondary" href="/settings/backup" download>
          Download backup
        </a>
      </section>
      <p class="mt">Signed in as {user.name} ({user.email}).</p>
      <form method="post" action="/logout">
        <Csrf token={c.var.csrf} />
        <button class="secondary" type="submit">
          Sign out
        </button>
      </form>
    </Layout>,
  );
});

const targetsSchema = z.object({
  kcal: z.number().finite().min(500).max(10000),
  protein: z.number().finite().min(0).max(500),
  fibre: z.number().finite().min(0).max(200),
});

pageRoutes.post("/settings/targets", async (c) => {
  const body = await c.req.parseBody();
  const parsed = targetsSchema.safeParse({ kcal: num(str(body, "kcal")), protein: num(str(body, "protein")), fibre: num(str(body, "fibre")) });
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Targets must be numbers: kcal 500–10,000, protein 0–500 g, fibre 0–200 g." });
  }
  c.var.deps.db
    .update(users)
    .set({ targetKcal: parsed.data.kcal, targetProteinG: parsed.data.protein, targetFibreG: parsed.data.fibre })
    .where(eq(users.id, c.var.user!.id))
    .run();
  return c.redirect("/settings?saved=1", 303);
});

pageRoutes.post("/settings/staples", async (c) => {
  addStaple(c.var.deps.db, c.var.user!.id, str(await c.req.parseBody(), "name"));
  return c.redirect("/settings#staples-h", 303);
});

pageRoutes.post("/settings/staples/:id/delete", (c) => {
  removeStaple(c.var.deps.db, c.var.user!.id, Number(c.req.param("id")) || -1);
  return c.redirect("/settings#staples-h", 303);
});

pageRoutes.get("/settings/backup", async (c) => {
  const { db, config, now } = c.var.deps;
  const dir = join(config.backup.dir, "downloads");
  const path = await createBackup(db, dir, new Date(now()));
  const body = readFileSync(path);
  rmSync(path, { force: true });
  c.header("Content-Type", "application/gzip");
  c.header("Content-Disposition", `attachment; filename="${basename(path)}"`);
  c.header("Cache-Control", "no-store");
  return c.body(body);
});
