import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { dayEntries, dayPlans, foods, meals, SLOTS, type Food, type Meal, type Slot } from "../db/schema.js";
import { addMacros, scaleMacros, ZERO, type Macros } from "../lib/nutrition.js";
import { foodMacros } from "./meals.js";

export type DayPlan = typeof dayPlans.$inferSelect;
export type DayEntry = typeof dayEntries.$inferSelect;

export type ResolvedEntry = DayEntry & {
  kind: "meal" | "food";
  name: string;
  meal: Meal | null;
  food: Food | null;
  macros: Macros;
};

export type DayDetail = DayPlan & {
  entries: ResolvedEntry[];
  bySlot: Record<Slot, ResolvedEntry[]>;
  totals: Macros;
};

export function entryMacros(e: { amount: number }, meal: Meal | null, food: Food | null): Macros {
  if (meal) return scaleMacros(meal, e.amount);
  if (food) return foodMacros(food, e.amount);
  return ZERO;
}

export function listDays(db: Db, userId: number): DayPlan[] {
  return db.select().from(dayPlans).where(eq(dayPlans.userId, userId)).orderBy(desc(dayPlans.updatedAt)).all();
}

/** Returns the day only if it belongs to the user. */
export function getDay(db: Db, userId: number, id: number): DayDetail | null {
  const day = db.select().from(dayPlans).where(and(eq(dayPlans.id, id), eq(dayPlans.userId, userId))).get();
  if (!day) return null;
  const rows = db
    .select({ entry: dayEntries, meal: meals, food: foods })
    .from(dayEntries)
    .leftJoin(meals, eq(meals.id, dayEntries.mealId))
    .leftJoin(foods, eq(foods.id, dayEntries.foodId))
    .where(eq(dayEntries.dayPlanId, id))
    .orderBy(asc(dayEntries.position), asc(dayEntries.id))
    .all();
  const entries: ResolvedEntry[] = rows
    .filter((r) => r.meal || r.food)
    .map((r) => ({
      ...r.entry,
      kind: r.meal ? "meal" : "food",
      name: r.meal?.name ?? r.food!.name,
      meal: r.meal,
      food: r.food,
      macros: entryMacros(r.entry, r.meal, r.food),
    }));
  const bySlot = Object.fromEntries(SLOTS.map((s) => [s, [] as ResolvedEntry[]])) as Record<Slot, ResolvedEntry[]>;
  for (const e of entries) bySlot[e.slot].push(e);
  const totals = entries.reduce((acc, e) => addMacros(acc, e.macros), ZERO);
  return { ...day, entries, bySlot, totals };
}

/** Totals for several days at once, for the list page. */
export function dayTotals(db: Db, dayIds: number[]): Map<number, Macros> {
  const out = new Map<number, Macros>();
  if (dayIds.length === 0) return out;
  const rows = db
    .select({ entry: dayEntries, meal: meals, food: foods })
    .from(dayEntries)
    .leftJoin(meals, eq(meals.id, dayEntries.mealId))
    .leftJoin(foods, eq(foods.id, dayEntries.foodId))
    .where(inArray(dayEntries.dayPlanId, dayIds))
    .all();
  for (const r of rows) {
    const prev = out.get(r.entry.dayPlanId) ?? ZERO;
    out.set(r.entry.dayPlanId, addMacros(prev, entryMacros(r.entry, r.meal, r.food)));
  }
  return out;
}

export function createDay(db: Db, userId: number, name: string, date: string | null): number {
  return db.insert(dayPlans).values({ userId, name, date }).returning({ id: dayPlans.id }).get().id;
}

export function renameDay(db: Db, userId: number, id: number, name: string, date: string | null): void {
  db.update(dayPlans)
    .set({ name, date, updatedAt: new Date() })
    .where(and(eq(dayPlans.id, id), eq(dayPlans.userId, userId)))
    .run();
}

export function deleteDay(db: Db, userId: number, id: number): void {
  db.delete(dayPlans).where(and(eq(dayPlans.id, id), eq(dayPlans.userId, userId))).run();
}

function touch(db: Db, dayId: number) {
  db.update(dayPlans).set({ updatedAt: new Date() }).where(eq(dayPlans.id, dayId)).run();
}

export function addEntry(
  db: Db,
  dayId: number,
  entry: { slot: Slot; mealId?: number | null; foodId?: number | null; amount: number },
): number {
  const pos = db.select({ p: max(dayEntries.position) }).from(dayEntries).where(eq(dayEntries.dayPlanId, dayId)).get()?.p ?? -1;
  const id = db
    .insert(dayEntries)
    .values({ dayPlanId: dayId, slot: entry.slot, mealId: entry.mealId ?? null, foodId: entry.foodId ?? null, amount: entry.amount, position: pos + 1 })
    .returning({ id: dayEntries.id })
    .get().id;
  touch(db, dayId);
  return id;
}

export function updateEntryAmount(db: Db, dayId: number, entryId: number, amount: number): void {
  db.update(dayEntries).set({ amount }).where(and(eq(dayEntries.id, entryId), eq(dayEntries.dayPlanId, dayId))).run();
  touch(db, dayId);
}

export function removeEntry(db: Db, dayId: number, entryId: number): void {
  db.delete(dayEntries).where(and(eq(dayEntries.id, entryId), eq(dayEntries.dayPlanId, dayId))).run();
  touch(db, dayId);
}

export function duplicateDay(db: Db, userId: number, id: number, name: string): number | null {
  const day = getDay(db, userId, id);
  if (!day) return null;
  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const newId = createDay(t, userId, name, null);
    if (day.entries.length) {
      t.insert(dayEntries)
        .values(day.entries.map((e) => ({ dayPlanId: newId, slot: e.slot, mealId: e.mealId, foodId: e.foodId, amount: e.amount, position: e.position })))
        .run();
    }
    return newId;
  });
}

/** Today's date in New Zealand as yyyy-mm-dd. */
export function nzToday(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Sat 7 Nov" for a yyyy-mm-dd date. */
export function formatDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}
