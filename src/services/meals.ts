import { and, asc, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  foods,
  mealIngredients,
  meals,
  type Category,
  type Food,
  type Meal,
  type MealIngredient,
  type NutritionStatus,
  type Slot,
  type Unit,
} from "../db/schema.js";

export type IngredientInput = {
  name: string;
  quantity: number | null;
  unit: Unit;
  category: Category;
  kcal: number | null;
  proteinG: number | null;
  fibreG: number | null;
};

export type MealInput = {
  name: string;
  slot: Slot;
  tags: string[];
  servingsInRecipe: number;
  method: string;
  source: string;
  kcal: number;
  proteinG: number;
  fibreG: number;
  nutritionStatus: NutritionStatus;
  assumptions: string[];
  notes: string;
  ingredients: IngredientInput[];
};

export type MealWithIngredients = Meal & { ingredients: MealIngredient[] };

export function getMeal(db: Db, id: number): MealWithIngredients | null {
  const meal = db.select().from(meals).where(eq(meals.id, id)).get();
  if (!meal) return null;
  const ingredients = db
    .select()
    .from(mealIngredients)
    .where(eq(mealIngredients.mealId, id))
    .orderBy(asc(mealIngredients.position), asc(mealIngredients.id))
    .all();
  return { ...meal, ingredients };
}

export function createMeal(db: Db, input: MealInput, userId: number | null): number {
  return db.transaction((tx) => {
    const { ingredients, ...fields } = input;
    const row = tx
      .insert(meals)
      .values({ ...fields, createdByUserId: userId })
      .returning({ id: meals.id })
      .get();
    insertIngredients(tx as unknown as Db, row.id, ingredients);
    return row.id;
  });
}

export function updateMeal(db: Db, id: number, input: MealInput): void {
  db.transaction((tx) => {
    const { ingredients, ...fields } = input;
    tx.update(meals)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(meals.id, id))
      .run();
    tx.delete(mealIngredients).where(eq(mealIngredients.mealId, id)).run();
    insertIngredients(tx as unknown as Db, id, ingredients);
  });
}

function insertIngredients(db: Db, mealId: number, ingredients: IngredientInput[]) {
  if (ingredients.length === 0) return;
  db.insert(mealIngredients)
    .values(ingredients.map((ing, position) => ({ ...ing, mealId, position })))
    .run();
}

export function deleteMeal(db: Db, id: number): void {
  db.delete(meals).where(eq(meals.id, id)).run();
}

export type MealSort = "name" | "protein" | "fibre" | "kcal" | "recent";
export type MealQuery = { slot?: Slot; tag?: string; q?: string; sort?: MealSort };

export function listMeals(db: Db, query: MealQuery = {}): Meal[] {
  const conds: SQL[] = [];
  if (query.slot) conds.push(eq(meals.slot, query.slot));
  if (query.tag) {
    conds.push(sql`exists (select 1 from json_each(${meals.tags}) where lower(json_each.value) = ${query.tag.toLowerCase()})`);
  }
  if (query.q) {
    const pattern = `%${query.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        sql`${meals.name} like ${pattern} escape '\\'`,
        sql`${meals.tags} like ${pattern} escape '\\'`,
        sql`exists (select 1 from ${mealIngredients} where ${mealIngredients.mealId} = ${meals.id} and ${mealIngredients.name} like ${pattern} escape '\\')`,
      )!,
    );
  }
  const order = {
    name: [asc(sql`lower(${meals.name})`)],
    protein: [desc(meals.proteinG), asc(meals.name)],
    fibre: [desc(meals.fibreG), asc(meals.name)],
    kcal: [asc(meals.kcal), asc(meals.name)],
    recent: [desc(meals.updatedAt)],
  }[query.sort ?? "name"];
  return db
    .select()
    .from(meals)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...order)
    .all();
}

export function allTags(db: Db): string[] {
  const rows = db.all<{ tag: string }>(
    sql`select distinct lower(json_each.value) as tag from ${meals}, json_each(${meals.tags}) order by tag`,
  );
  return rows.map((r) => r.tag);
}

export type FoodInput = Omit<Food, "id" | "createdByUserId" | "createdAt" | "updatedAt">;

export function listFoods(db: Db, q?: string): Food[] {
  return db
    .select()
    .from(foods)
    .where(q ? like(foods.name, `%${q}%`) : undefined)
    .orderBy(asc(sql`lower(${foods.name})`))
    .all();
}

export function getFood(db: Db, id: number): Food | null {
  return db.select().from(foods).where(eq(foods.id, id)).get() ?? null;
}

export function createFood(db: Db, input: FoodInput, userId: number | null): number {
  return db
    .insert(foods)
    .values({ ...input, createdByUserId: userId })
    .returning({ id: foods.id })
    .get().id;
}

export function updateFood(db: Db, id: number, input: FoodInput): void {
  db.update(foods)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(foods.id, id))
    .run();
}

export function deleteFood(db: Db, id: number): void {
  db.delete(foods).where(eq(foods.id, id)).run();
}

/** Nutrition for an amount (g or ml) of a food. */
export function foodMacros(food: Food, amount: number) {
  const f = amount / 100;
  return { kcal: food.kcalPer100 * f, proteinG: food.proteinPer100 * f, fibreG: food.fibrePer100 * f };
}
