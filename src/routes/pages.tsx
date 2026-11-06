import { Hono } from "hono";
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
