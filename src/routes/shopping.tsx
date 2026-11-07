import { Hono } from "hono";
import type { AppEnv, Ctx } from "../context.js";
import { CATEGORIES, CATEGORY_LABELS, SLOTS, SLOT_LABELS } from "../db/schema.js";
import { num, str, strs } from "../lib/forms.js";
import { formatQuantity, listToText } from "../lib/shopping.js";
import { formatDate, listDays, nzToday } from "../services/days.js";
import { listMeals } from "../services/meals.js";
import { deleteList, generateList, getList, listLists, setChecked } from "../services/shopping.js";
import { Csrf, Layout } from "../views/layout.js";
import { Errors } from "../views/components.js";

export const shoppingRoutes = new Hono<AppEnv>();

const idOf = (raw: string | undefined) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : -1;
};

shoppingRoutes.get("/shopping", (c) => {
  const lists = listLists(c.var.deps.db, c.var.user!.id);
  return c.html(
    <Layout title="Shopping" user={c.var.user} tab="shop">
      <div class="row spread">
        <h1>Shopping</h1>
        <a class="btn small" href="/shopping/new">
          + New list
        </a>
      </div>
      {lists.length === 0 ? <p class="muted">No lists yet. Make one from your days or meals.</p> : null}
      <div class="cards">
        {lists.map((l) => (
          <a class="card card-link" href={`/shopping/${l.id}`}>
            <h3>{l.name}</h3>
            <p class="small muted">
              For {l.people} {l.people === 1 ? "person" : "people"} · made {formatDate(nzToday(l.createdAt.getTime()))}
            </p>
          </a>
        ))}
      </div>
    </Layout>,
  );
});

function NewListPage(props: { c: Ctx; errors?: string[]; mealIds?: number[]; dayIds?: number[]; people?: number }) {
  const { c } = props;
  const { db } = c.var.deps;
  const days = listDays(db, c.var.user!.id);
  const meals = listMeals(db, { sort: "name" });
  const mealIds = new Set(props.mealIds ?? []);
  const dayIds = new Set(props.dayIds ?? []);
  return (
    <Layout title="New shopping list" user={c.var.user} tab="shop">
      <h1>New shopping list</h1>
      <Errors errors={props.errors} />
      <form method="post" action="/shopping" class="stack">
        <Csrf token={c.var.csrf} />
        <div class="grid-2">
          <div class="field">
            <label for="people">People</label>
            <input id="people" name="people" type="number" inputmode="decimal" min="0.5" step="0.5" value={String(props.people ?? 2)} />
          </div>
        </div>
        <p class="small muted">A day is scaled by its servings for each person. A meal on its own is one serve each.</p>

        <fieldset class="card">
          <legend>Days</legend>
          {days.length === 0 ? <p class="small muted">No saved days yet.</p> : null}
          {days.map((d) => (
            <label class="row check-row">
              <input type="checkbox" name="day" value={String(d.id)} checked={dayIds.has(d.id)} /> {d.name}
              {d.date && formatDate(d.date) !== d.name ? <span class="small muted"> · {formatDate(d.date)}</span> : null}
            </label>
          ))}
        </fieldset>

        <fieldset class="card">
          <legend>Meals</legend>
          {SLOTS.map((slot) => {
            const inSlot = meals.filter((m) => m.slot === slot);
            if (!inSlot.length) return null;
            return (
              <>
                <p class="eyebrow mt-s">{SLOT_LABELS[slot]}</p>
                {inSlot.map((m) => (
                  <label class="row check-row">
                    <input type="checkbox" name="meal" value={String(m.id)} checked={mealIds.has(m.id)} /> {m.name}
                  </label>
                ))}
              </>
            );
          })}
        </fieldset>
        <div class="sticky-actions">
          <button type="submit" data-busy="Making list…">
            Make shopping list
          </button>
        </div>
      </form>
    </Layout>
  );
}

shoppingRoutes.get("/shopping/new", (c) => {
  const day = idOf(c.req.query("day"));
  const meal = idOf(c.req.query("meal"));
  return c.html(<NewListPage c={c} dayIds={day > 0 ? [day] : []} mealIds={meal > 0 ? [meal] : []} />);
});

shoppingRoutes.post("/shopping", async (c) => {
  const { db, now } = c.var.deps;
  const user = c.var.user!;
  const body = await c.req.parseBody({ all: true });
  const mealIds = [...new Set(strs(body, "meal").map(idOf).filter((n) => n > 0))];
  const dayIds = [...new Set(strs(body, "day").map(idOf).filter((n) => n > 0))];
  const peopleRaw = num(str(body, "people"));
  const people = peopleRaw != null && peopleRaw > 0 && peopleRaw <= 20 ? peopleRaw : NaN;
  const errors: string[] = [];
  if (!mealIds.length && !dayIds.length) errors.push("Pick at least one day or meal.");
  if (Number.isNaN(people)) errors.push("People must be between 0.5 and 20.");
  if (errors.length) return c.html(<NewListPage c={c} errors={errors} mealIds={mealIds} dayIds={dayIds} />, 400);

  const allDays = listDays(db, user.id);
  const days = dayIds.map((id) => allDays.find((d) => d.id === id)).filter((d) => d !== undefined);
  const name = days.length ? `Shopping: ${days.map((d) => d.name).join(", ")}`.slice(0, 100) : `Shopping ${formatDate(nzToday(now()))}`;
  const { id, withoutIngredients } = generateList(db, user.id, name, { mealIds, dayIds, people });
  const q = withoutIngredients.length ? `?missing=${encodeURIComponent(withoutIngredients.join("|"))}` : "";
  return c.redirect(`/shopping/${id}${q}`, 303);
});

shoppingRoutes.get("/shopping/:id", (c) => {
  const list = getList(c.var.deps.db, c.var.user!.id, idOf(c.req.param("id")));
  if (!list) return c.notFound();
  const showStaples = c.req.query("staples") === "1";
  const missing = (c.req.query("missing") ?? "").split("|").filter(Boolean).slice(0, 30);
  const visible = list.items.filter((i) => showStaples || !i.isStaple);
  const hiddenStaples = list.items.filter((i) => i.isStaple).length;
  const text = listToText(list.name, visible, CATEGORY_LABELS);
  const done = visible.filter((i) => i.checked).length;
  return c.html(
    <Layout title={list.name} user={c.var.user} tab="shop">
      <p class="small">
        <a href="/shopping">← All lists</a>
      </p>
      <h1>{list.name}</h1>
      <p class="small muted">
        For {list.people} {list.people === 1 ? "person" : "people"}. Amounts are rounded up.{" "}
        <span aria-live="polite" data-progress>
          {done} of {visible.length} ticked.
        </span>
      </p>
      {missing.length ? (
        <div class="notice small">
          These meals have no ingredient list yet, so they aren't on it: {missing.join(", ")}. Paste their recipes to add ingredients.
        </div>
      ) : null}
      {hiddenStaples ? (
        <p class="small">
          {showStaples ? (
            <a href={`/shopping/${list.id}`}>Hide pantry staples ({hiddenStaples})</a>
          ) : (
            <a href={`/shopping/${list.id}?staples=1`}>Show pantry staples ({hiddenStaples} hidden)</a>
          )}
        </p>
      ) : null}

      {visible.length === 0 ? <p class="muted">Nothing to buy.</p> : null}
      {CATEGORIES.map((cat) => {
        const items = visible.filter((i) => i.category === cat);
        if (!items.length) return null;
        return (
          <section class="shop-section">
            <h2>{CATEGORY_LABELS[cat]}</h2>
            <ul class="card shop-list">
              {items.map((i) => (
                <li>
                  <form method="post" action={`/shopping/${list.id}/items/${i.id}`} class="shop-item" data-toggle-item>
                    <Csrf token={c.var.csrf} />
                    <input type="hidden" name="checked" value={i.checked ? "0" : "1"} />
                    <button type="submit" class="check" role="checkbox" aria-checked={i.checked ? "true" : "false"}>
                      <span class="box" aria-hidden="true"></span>
                      <span class="item-name">{i.name}</span>
                      <span class="item-qty">{formatQuantity(i.quantity, i.unit)}</span>
                      {i.isStaple ? <span class="pill">pantry</span> : null}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <h2>Copy or share</h2>
      <label for="list-text" class="sr-only">
        List as plain text
      </label>
      <textarea id="list-text" readonly rows={8}>
        {text}
      </textarea>
      <div class="row mt-s">
        <button type="button" data-copy="list-text">
          Copy
        </button>
        <button type="button" class="secondary" data-copy="list-text" data-share>
          Share
        </button>
      </div>

      <form method="post" action={`/shopping/${list.id}/delete`} data-confirm="Delete this list?" class="mt">
        <Csrf token={c.var.csrf} />
        <button type="submit" class="danger small">
          Delete list
        </button>
      </form>
    </Layout>,
  );
});

shoppingRoutes.post("/shopping/:id/items/:iid", async (c) => {
  const list = getList(c.var.deps.db, c.var.user!.id, idOf(c.req.param("id")));
  if (!list) return c.notFound();
  const checked = str(await c.req.parseBody(), "checked") === "1";
  const ok = setChecked(c.var.deps.db, list.id, idOf(c.req.param("iid")), checked);
  if (!ok) return c.notFound();
  if (c.req.header("accept")?.includes("application/json")) return c.json({ checked });
  return c.redirect(`/shopping/${list.id}`, 303);
});

shoppingRoutes.post("/shopping/:id/delete", (c) => {
  deleteList(c.var.deps.db, c.var.user!.id, idOf(c.req.param("id")));
  return c.redirect("/shopping", 303);
});
