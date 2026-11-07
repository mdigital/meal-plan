import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { appMeta, mealIngredients, meals, pantryStaples, shoppingItems, shoppingLists } from "../db/schema.js";
import { buildShoppingList, type NeedLine, type ShoppingLine } from "../lib/shopping.js";
import { getDay } from "./days.js";

export const DEFAULT_STAPLES = ["Bay leaves", "Dried herbs", "Spices", "Salt", "Pepper", "Flour", "Sugar", "Butter", "Olive oil"];

/** Seeds a user's pantry staples once. Safe to call on every request that needs them. */
export function ensurePantryDefaults(db: Db, userId: number): void {
  const key = `pantry_seeded:${userId}`;
  if (db.select().from(appMeta).where(eq(appMeta.key, key)).get()) return;
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    t.insert(pantryStaples).values(DEFAULT_STAPLES.map((name) => ({ userId, name }))).run();
    t.insert(appMeta).values({ key, value: new Date().toISOString() }).run();
  });
}

export function listStaples(db: Db, userId: number) {
  ensurePantryDefaults(db, userId);
  return db.select().from(pantryStaples).where(eq(pantryStaples.userId, userId)).orderBy(asc(pantryStaples.name)).all();
}

export function addStaple(db: Db, userId: number, name: string): void {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!clean) return;
  const exists = listStaples(db, userId).some((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (!exists) db.insert(pantryStaples).values({ userId, name: clean }).run();
}

export function removeStaple(db: Db, userId: number, id: number): void {
  db.delete(pantryStaples).where(and(eq(pantryStaples.id, id), eq(pantryStaples.userId, userId))).run();
}

export type Selection = { mealIds: number[]; dayIds: number[]; people: number };

/**
 * Turns selected meals and days into scaled ingredient lines.
 * - A selected meal means one serve per person.
 * - A selected day means each entry's servings (or grams of a food) per person.
 */
export function collectNeeds(db: Db, userId: number, sel: Selection): { lines: NeedLine[]; withoutIngredients: string[] } {
  const servingsByMeal = new Map<number, number>(); // total serves needed per meal
  const lines: NeedLine[] = [];
  for (const id of sel.mealIds) servingsByMeal.set(id, (servingsByMeal.get(id) ?? 0) + sel.people);
  for (const dayId of sel.dayIds) {
    const day = getDay(db, userId, dayId);
    if (!day) continue;
    for (const e of day.entries) {
      if (e.meal) servingsByMeal.set(e.meal.id, (servingsByMeal.get(e.meal.id) ?? 0) + e.amount * sel.people);
      else if (e.food) lines.push({ name: e.food.name, quantity: e.amount * sel.people, unit: e.food.unit, category: e.food.category });
    }
  }
  const ids = [...servingsByMeal.keys()];
  const withoutIngredients: string[] = [];
  if (ids.length) {
    const mealRows = db.select().from(meals).where(inArray(meals.id, ids)).all();
    const ingRows = db.select().from(mealIngredients).where(inArray(mealIngredients.mealId, ids)).orderBy(asc(mealIngredients.mealId), asc(mealIngredients.position)).all();
    for (const meal of mealRows) {
      const mine = ingRows.filter((i) => i.mealId === meal.id);
      if (mine.length === 0) {
        withoutIngredients.push(meal.name);
        continue;
      }
      const factor = servingsByMeal.get(meal.id)! / (meal.servingsInRecipe || 1);
      for (const i of mine) {
        lines.push({ name: i.name, quantity: i.quantity == null ? null : i.quantity * factor, unit: i.unit, category: i.category });
      }
    }
  }
  return { lines, withoutIngredients };
}

export function generateList(db: Db, userId: number, name: string, sel: Selection) {
  const { lines, withoutIngredients } = collectNeeds(db, userId, sel);
  const staples = listStaples(db, userId).map((s) => s.name);
  const items = buildShoppingList(lines, staples);
  const id = db.transaction((tx) => {
    const t = tx as unknown as Db;
    const listId = t.insert(shoppingLists).values({ userId, name, people: sel.people }).returning({ id: shoppingLists.id }).get().id;
    if (items.length) {
      t.insert(shoppingItems)
        .values(items.map((it: ShoppingLine, position) => ({ listId, position, name: it.name, quantity: it.quantity, unit: it.unit, category: it.category, isStaple: it.isStaple })))
        .run();
    }
    return listId;
  });
  return { id, withoutIngredients };
}

export function listLists(db: Db, userId: number) {
  return db.select().from(shoppingLists).where(eq(shoppingLists.userId, userId)).orderBy(desc(shoppingLists.createdAt), desc(shoppingLists.id)).all();
}

export function getList(db: Db, userId: number, id: number) {
  const list = db.select().from(shoppingLists).where(and(eq(shoppingLists.id, id), eq(shoppingLists.userId, userId))).get();
  if (!list) return null;
  const items = db.select().from(shoppingItems).where(eq(shoppingItems.listId, id)).orderBy(asc(shoppingItems.position)).all();
  return { ...list, items };
}

export function setChecked(db: Db, listId: number, itemId: number, checked: boolean): boolean {
  const r = db.update(shoppingItems).set({ checked }).where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.listId, listId))).run();
  return r.changes > 0;
}

export function deleteList(db: Db, userId: number, id: number): void {
  db.delete(shoppingLists).where(and(eq(shoppingLists.id, id), eq(shoppingLists.userId, userId))).run();
}
