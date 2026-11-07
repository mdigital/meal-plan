import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx } from "../context.js";
import { SLOTS, SLOT_LABELS, type Slot } from "../db/schema.js";
import { num, str, strs } from "../lib/forms.js";
import { fmtG } from "../lib/nutrition.js";
import {
  addEntry,
  createDay,
  dayTotals,
  deleteDay,
  duplicateDay,
  formatDate,
  getDay,
  listDays,
  nzToday,
  removeEntry,
  renameDay,
  updateEntryAmount,
  type DayDetail,
  type ResolvedEntry,
} from "../services/days.js";
import { foodMacros, getFood, getMeal, listFoods, listMeals } from "../services/meals.js";
import { Csrf, Layout } from "../views/layout.js";
import { Errors, MacroLine } from "../views/components.js";
import { TargetBars } from "../views/targets.js";

export const dayRoutes = new Hono<AppEnv>();

const idOf = (raw: string | undefined) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : -1;
};
const slotOf = (raw: string | undefined, fallback: Slot = "dinner"): Slot =>
  SLOTS.includes(raw as Slot) ? (raw as Slot) : fallback;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const parseDate = (raw: string) => (dateSchema.safeParse(raw).success ? raw : null);
const amountSchema = z.number().finite().gt(0).max(5000);

function defaultDayName(date: string) {
  return formatDate(date);
}

// ---------- List ----------

dayRoutes.get("/days", (c) => {
  const { db, now } = c.var.deps;
  const user = c.var.user!;
  const days = listDays(db, user.id);
  const totals = dayTotals(db, days.map((d) => d.id));
  return c.html(
    <Layout title="Days" user={user} tab="day">
      <h1>Days</h1>
      <form method="post" action="/days" class="card stack">
        <Csrf token={c.var.csrf} />
        <div class="grid-2">
          <div class="field">
            <label for="new-name">Name</label>
            <input id="new-name" name="name" placeholder="e.g. Monday, Training day" />
          </div>
          <div class="field">
            <label for="new-date">Date (optional)</label>
            <input id="new-date" name="date" type="date" value={nzToday(now())} />
          </div>
        </div>
        <button type="submit">+ New day</button>
      </form>
      <h2>Saved days</h2>
      {days.length === 0 ? <p class="muted">No days yet. Start one above.</p> : null}
      <div class="cards">
        {days.map((d) => {
          const t = totals.get(d.id) ?? { kcal: 0, proteinG: 0, fibreG: 0 };
          return (
            <a class="card card-link" href={`/days/${d.id}`}>
              <h3>{d.name}</h3>
              {d.date && formatDate(d.date) !== d.name ? <p class="small muted">{formatDate(d.date)}</p> : null}
              <MacroLine m={t} class="small" />
            </a>
          );
        })}
      </div>
    </Layout>,
  );
});

dayRoutes.post("/days", async (c) => {
  const { db } = c.var.deps;
  const body = await c.req.parseBody();
  const date = parseDate(str(body, "date"));
  const name = str(body, "name").trim().slice(0, 100) || (date ? defaultDayName(date) : "New day");
  const id = createDay(db, c.var.user!.id, name, date);
  return c.redirect(`/days/${id}`, 303);
});

// ---------- Add a meal to a day, from the meal page ----------

dayRoutes.get("/days/add", (c) => {
  const { db, now } = c.var.deps;
  const meal = getMeal(db, idOf(c.req.query("meal")));
  if (!meal) return c.notFound();
  const days = listDays(db, c.var.user!.id);
  return c.html(
    <Layout title="Add to a day" user={c.var.user} tab="day">
      <h1>Add “{meal.name}” to a day</h1>
      <form method="post" action="/days/add" class="stack">
        <Csrf token={c.var.csrf} />
        <input type="hidden" name="meal_id" value={String(meal.id)} />
        <div class="grid-2">
          <div class="field">
            <label for="slot">Slot</label>
            <select id="slot" name="slot">
              {SLOTS.map((s) => (
                <option value={s} selected={s === meal.slot}>
                  {SLOT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="amount">Servings</label>
            <input id="amount" name="amount" inputmode="decimal" value="1" />
          </div>
        </div>
        <fieldset class="card">
          <legend>Which day?</legend>
          <label class="row">
            <input type="radio" name="day_id" value="new" checked={days.length === 0} /> New day for {formatDate(nzToday(now()))}
          </label>
          {days.map((d, i) => (
            <label class="row">
              <input type="radio" name="day_id" value={String(d.id)} checked={i === 0} /> {d.name}
            </label>
          ))}
        </fieldset>
        <button type="submit">Add</button>
      </form>
    </Layout>,
  );
});

dayRoutes.post("/days/add", async (c) => {
  const { db, now } = c.var.deps;
  const user = c.var.user!;
  const body = await c.req.parseBody();
  const meal = getMeal(db, idOf(str(body, "meal_id")));
  if (!meal) return c.notFound();
  const amount = amountSchema.safeParse(num(str(body, "amount")) ?? 1);
  let dayId: number;
  if (str(body, "day_id") === "new" || !str(body, "day_id")) {
    const date = nzToday(now());
    dayId = createDay(db, user.id, defaultDayName(date), date);
  } else {
    const day = getDay(db, user.id, idOf(str(body, "day_id")));
    if (!day) return c.notFound();
    dayId = day.id;
  }
  const slot = slotOf(str(body, "slot"), meal.slot);
  addEntry(db, dayId, { slot, mealId: meal.id, amount: amount.success ? amount.data : 1 });
  return c.redirect(`/days/${dayId}#slot-${slot}`, 303);
});

// ---------- Builder ----------

function loadDay(c: Ctx) {
  return getDay(c.var.deps.db, c.var.user!.id, idOf(c.req.param("id")));
}

function EntryRow(props: { day: DayDetail; e: ResolvedEntry; csrf: string }) {
  const { day, e, csrf } = props;
  const isMeal = e.kind === "meal";
  const unit = isMeal ? "serves" : e.food!.unit;
  const inputId = `amt-${e.id}`;
  return (
    <div class="entry" id={`entry-${e.id}`}>
      <div>
        <div class="entry-name">{isMeal ? <a href={`/meals/${e.mealId}`}>{e.name}</a> : e.name}</div>
        <MacroLine m={e.macros} class="small" />
      </div>
      <form method="post" action={`/days/${day.id}/entries/${e.id}/delete`}>
        <Csrf token={csrf} />
        <button type="submit" class="secondary small" aria-label={`Remove ${e.name}`}>
          ✕
        </button>
      </form>
      <form method="post" action={`/days/${day.id}/entries/${e.id}`} class="entry-controls" data-autosubmit>
        <Csrf token={csrf} />
        <label for={inputId} class="sr-only">
          {isMeal ? "Servings" : `Amount in ${unit}`} for {e.name}
        </label>
        <input id={inputId} name="amount" type="number" inputmode="decimal" min={isMeal ? "0.25" : "1"} step={isMeal ? "0.25" : "5"} value={fmtG(e.amount)} />
        <span class="unit">{unit}</span>
        {isMeal
          ? [0.5, 1, 1.5, 2].map((v) => (
              <button type="submit" name="amount" value={String(v)} class={`secondary small ${e.amount === v ? "is-current" : ""}`} aria-pressed={e.amount === v ? "true" : "false"}>
                {v === 0.5 ? "½" : v === 1.5 ? "1½" : String(v)}
              </button>
            ))
          : null}
        <button type="submit" class="small js-hide">
          Update
        </button>
      </form>
    </div>
  );
}

dayRoutes.get("/days/:id", (c) => {
  const day = loadDay(c);
  if (!day) return c.notFound();
  const user = c.var.user!;
  return c.html(
    <Layout title={day.name} user={user} tab="day">
      <p class="small">
        <a href="/days">← All days</a>
      </p>
      <div class="row spread">
        <h1>{day.name}</h1>
      </div>
      {day.date && formatDate(day.date) !== day.name ? <p class="small muted">{formatDate(day.date)}</p> : null}

      <section class="card totals-card" aria-label="Totals against your targets">
        <TargetBars totals={day.totals} user={user} compact />
      </section>

      {SLOTS.map((slot) => {
        const entries = day.bySlot[slot];
        if (entries.length === 0 && (slot === "other" || slot === "snack")) {
          // Keep rarely used slots compact when empty.
          return (
            <section class="slot-section" id={`slot-${slot}`}>
              <div class="slot-head">
                <h2 class="small muted">{SLOT_LABELS[slot]}</h2>
                <a class="btn secondary small" href={`/days/${day.id}/add?slot=${slot}`}>
                  + Add
                </a>
              </div>
            </section>
          );
        }
        return (
          <section class="slot-section" id={`slot-${slot}`}>
            <div class="slot-head">
              <h2>{SLOT_LABELS[slot]}</h2>
              <a class="btn secondary small" href={`/days/${day.id}/add?slot=${slot}`} aria-label={`Add to ${SLOT_LABELS[slot]}`}>
                + Add
              </a>
            </div>
            <div class="card">
              {entries.length === 0 ? <p class="empty-slot">Nothing yet.</p> : null}
              {entries.map((e) => (
                <EntryRow day={day} e={e} csrf={c.var.csrf} />
              ))}
            </div>
          </section>
        );
      })}

      <details class="card mt">
        <summary>Name, date, duplicate or delete</summary>
        <form method="post" action={`/days/${day.id}`} class="stack mt">
          <Csrf token={c.var.csrf} />
          <div class="field">
            <label for="day-name">Name</label>
            <input id="day-name" name="name" value={day.name} required maxlength={100} />
          </div>
          <div class="field">
            <label for="day-date">Date</label>
            <input id="day-date" name="date" type="date" value={day.date ?? ""} />
          </div>
          <button type="submit">Save</button>
        </form>
        <div class="row mt">
          <form method="post" action={`/days/${day.id}/duplicate`}>
            <Csrf token={c.var.csrf} />
            <button type="submit" class="secondary">
              Duplicate day
            </button>
          </form>
          <a class="btn secondary" href={`/shopping/new?day=${day.id}`}>
            Shopping list
          </a>
          <form method="post" action={`/days/${day.id}/delete`} data-confirm={`Delete "${day.name}"?`}>
            <Csrf token={c.var.csrf} />
            <button type="submit" class="danger">
              Delete
            </button>
          </form>
        </div>
      </details>
    </Layout>,
  );
});

dayRoutes.post("/days/:id", async (c) => {
  const day = loadDay(c);
  if (!day) return c.notFound();
  const body = await c.req.parseBody();
  const name = str(body, "name").trim().slice(0, 100) || day.name;
  renameDay(c.var.deps.db, c.var.user!.id, day.id, name, parseDate(str(body, "date")));
  return c.redirect(`/days/${day.id}`, 303);
});

dayRoutes.post("/days/:id/duplicate", (c) => {
  const day = loadDay(c);
  if (!day) return c.notFound();
  const newId = duplicateDay(c.var.deps.db, c.var.user!.id, day.id, `${day.name} (copy)`.slice(0, 100));
  return c.redirect(`/days/${newId}`, 303);
});

dayRoutes.post("/days/:id/delete", (c) => {
  const day = loadDay(c);
  if (!day) return c.notFound();
  deleteDay(c.var.deps.db, c.var.user!.id, day.id);
  return c.redirect("/days", 303);
});

// ---------- Picker ----------

dayRoutes.get("/days/:id/add", (c) => {
  const day = loadDay(c);
  if (!day) return c.notFound();
  const { db } = c.var.deps;
  const slot = slotOf(c.req.query("slot"));
  const q = c.req.query("q")?.trim().slice(0, 100) || undefined;
  const all = c.req.query("all") === "1" || !!q;
  const meals = listMeals(db, { slot: all ? undefined : slot, q, sort: "name" });
  const foods = listFoods(db, q);
  const base = `/days/${day.id}/add?slot=${slot}`;
  return c.html(
    <Layout title={`Add to ${SLOT_LABELS[slot]}`} user={c.var.user} tab="day">
      <p class="small">
        <a href={`/days/${day.id}#slot-${slot}`}>← {day.name}</a>
      </p>
      <h1>Add to {SLOT_LABELS[slot]}</h1>
      <section class="card totals-card" aria-label="Totals so far">
        <TargetBars totals={day.totals} user={c.var.user!} compact />
      </section>
      <form method="get" action={`/days/${day.id}/add`} role="search" class="search mt">
        <input type="hidden" name="slot" value={slot} />
        <label for="q" class="sr-only">
          Search meals and foods
        </label>
        <input id="q" name="q" type="search" placeholder="Search meals and foods" value={q ?? ""} />
      </form>
      <nav class="chips" aria-label="Which meals">
        <a class="chip" href={base} aria-current={!all ? "true" : undefined}>
          {SLOT_LABELS[slot]} meals
        </a>
        <a class="chip" href={`${base}&all=1`} aria-current={all ? "true" : undefined}>
          All meals
        </a>
      </nav>
      <h2>Meals</h2>
      <div class="stack pick-list">
        {meals.length === 0 ? <p class="muted">No meals here.</p> : null}
        {meals.map((m) => (
          <form method="post" action={`/days/${day.id}/entries`}>
            <Csrf token={c.var.csrf} />
            <input type="hidden" name="slot" value={slot} />
            <input type="hidden" name="meal_id" value={String(m.id)} />
            <input type="hidden" name="amount" value="1" />
            <button type="submit" class="pick">
              <span>
                <span class="entry-name">{m.name}</span>
                <MacroLine m={m} />
              </span>
              <span class="add">+ Add</span>
            </button>
          </form>
        ))}
      </div>
      <h2>Foods</h2>
      <div class="stack pick-list">
        {foods.length === 0 ? (
          <p class="muted">
            No foods. <a href="/foods/new">Add one</a>.
          </p>
        ) : null}
        {foods.map((f) => (
          <form method="post" action={`/days/${day.id}/entries`}>
            <Csrf token={c.var.csrf} />
            <input type="hidden" name="slot" value={slot} />
            <input type="hidden" name="food_id" value={String(f.id)} />
            <input type="hidden" name="amount" value={String(f.defaultAmount)} />
            <button type="submit" class="pick">
              <span>
                <span class="entry-name">
                  {f.name} <span class="muted small">{fmtG(f.defaultAmount)} {f.unit}</span>
                </span>
                <MacroLine m={foodMacros(f, f.defaultAmount)} />
              </span>
              <span class="add">+ Add</span>
            </button>
          </form>
        ))}
      </div>
    </Layout>,
  );
});

dayRoutes.post("/days/:id/entries", async (c) => {
  const day = loadDay(c);
  if (!day) return c.notFound();
  const { db } = c.var.deps;
  const body = await c.req.parseBody();
  const slot = slotOf(str(body, "slot"));
  const amount = amountSchema.safeParse(num(str(body, "amount")));
  const mealId = str(body, "meal_id") ? idOf(str(body, "meal_id")) : null;
  const foodId = str(body, "food_id") ? idOf(str(body, "food_id")) : null;
  if (!amount.success || (!mealId && !foodId)) {
    return c.html(<Layout title="Error" user={c.var.user}><Errors errors={["Choose a meal or food and an amount."]} /></Layout>, 400);
  }
  if (mealId && !getMeal(db, mealId)) return c.notFound();
  if (foodId && !getFood(db, foodId)) return c.notFound();
  addEntry(db, day.id, { slot, mealId, foodId: mealId ? null : foodId, amount: amount.data });
  return c.redirect(`/days/${day.id}#slot-${slot}`, 303);
});

dayRoutes.post("/days/:id/entries/:eid", async (c) => {
  const day = loadDay(c);
  if (!day) return c.notFound();
  const eid = idOf(c.req.param("eid"));
  const entry = day.entries.find((e) => e.id === eid);
  if (!entry) return c.notFound();
  // The quick buttons and the number input share the name "amount"; the clicked button comes last.
  const values = strs(await c.req.parseBody({ all: true }), "amount");
  const amount = amountSchema.safeParse(num(values.at(-1) ?? ""));
  if (amount.success) updateEntryAmount(c.var.deps.db, day.id, eid, amount.data);
  return c.redirect(`/days/${day.id}#entry-${eid}`, 303);
});

dayRoutes.post("/days/:id/entries/:eid/delete", (c) => {
  const day = loadDay(c);
  if (!day) return c.notFound();
  removeEntry(c.var.deps.db, day.id, idOf(c.req.param("eid")));
  return c.redirect(`/days/${day.id}`, 303);
});
