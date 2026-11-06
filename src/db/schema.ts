import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);

export const users = sqliteTable("user", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  targetKcal: real("target_kcal").notNull().default(1500),
  targetProteinG: real("target_protein_g").notNull().default(120),
  targetFibreG: real("target_fibre_g").notNull().default(28),
  createdAt: createdAt(),
});

export const loginTokens = sqliteTable(
  "login_token",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("login_token_email_idx").on(t.email)],
);

export const sessions = sqliteTable(
  "session",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;

export const SLOTS = ["breakfast", "morning_tea", "lunch", "dinner", "snack", "other"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABELS: Record<Slot, string> = {
  breakfast: "Breakfast",
  morning_tea: "Morning tea",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  other: "Other",
};

export const UNITS = ["g", "kg", "ml", "L", "tsp", "tbsp", "whole"] as const;
export type Unit = (typeof UNITS)[number];

export const CATEGORIES = ["produce", "meat_fish", "dairy", "pantry", "frozen", "bakery", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  produce: "Produce",
  meat_fish: "Meat and fish",
  dairy: "Dairy",
  pantry: "Pantry",
  frozen: "Frozen",
  bakery: "Bakery",
  other: "Other",
};

export const NUTRITION_STATUSES = ["ai_estimate", "edited", "manual"] as const;
export type NutritionStatus = (typeof NUTRITION_STATUSES)[number];

const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now);

/** Meals belong to the shared household library; created_by records who added it. */
export const meals = sqliteTable(
  "meal",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slot: text("slot", { enum: SLOTS }).notNull().default("dinner"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    servingsInRecipe: real("servings_in_recipe").notNull().default(1),
    method: text("method").notNull().default(""),
    source: text("source").notNull().default(""),
    kcal: real("kcal").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    fibreG: real("fibre_g").notNull().default(0),
    nutritionStatus: text("nutrition_status", { enum: NUTRITION_STATUSES }).notNull().default("manual"),
    assumptions: text("assumptions", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meal_slot_idx").on(t.slot)],
);

/** Ingredient quantities are for the whole recipe; nutrition columns are for that line, whole recipe. */
export const mealIngredients = sqliteTable(
  "meal_ingredient",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mealId: integer("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    name: text("name").notNull(),
    quantity: real("quantity"),
    unit: text("unit", { enum: UNITS }).notNull().default("whole"),
    category: text("category", { enum: CATEGORIES }).notNull().default("other"),
    kcal: real("kcal"),
    proteinG: real("protein_g"),
    fibreG: real("fibre_g"),
  },
  (t) => [index("meal_ingredient_meal_idx").on(t.mealId)],
);

/** Single items (yoghurt, whey) with per-100 g (or ml) nutrition. */
export const foods = sqliteTable("food", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  unit: text("unit", { enum: ["g", "ml"] }).notNull().default("g"),
  defaultAmount: real("default_amount").notNull().default(100),
  kcalPer100: real("kcal_per_100").notNull().default(0),
  proteinPer100: real("protein_per_100").notNull().default(0),
  fibrePer100: real("fibre_per_100").notNull().default(0),
  category: text("category", { enum: CATEGORIES }).notNull().default("other"),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dayPlans = sqliteTable("day_plan", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  date: text("date"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A meal (amount = servings) or a food (amount = g or ml) in a day slot. */
export const dayEntries = sqliteTable(
  "day_entry",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dayPlanId: integer("day_plan_id")
      .notNull()
      .references(() => dayPlans.id, { onDelete: "cascade" }),
    slot: text("slot", { enum: SLOTS }).notNull(),
    position: integer("position").notNull().default(0),
    mealId: integer("meal_id").references(() => meals.id, { onDelete: "cascade" }),
    foodId: integer("food_id").references(() => foods.id, { onDelete: "cascade" }),
    amount: real("amount").notNull().default(1),
  },
  (t) => [index("day_entry_plan_idx").on(t.dayPlanId)],
);

export const shoppingLists = sqliteTable("shopping_list", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  people: real("people").notNull().default(2),
  createdAt: createdAt(),
});

export const shoppingItems = sqliteTable(
  "shopping_item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    name: text("name").notNull(),
    quantity: real("quantity"),
    unit: text("unit").notNull().default(""),
    category: text("category", { enum: CATEGORIES }).notNull().default("other"),
    isStaple: integer("is_staple", { mode: "boolean" }).notNull().default(false),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("shopping_item_list_idx").on(t.listId)],
);

export const pantryStaples = sqliteTable(
  "pantry_staple",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [index("pantry_staple_user_idx").on(t.userId)],
);

/** One row per AI import attempt, for the daily cap. */
export const aiImports = sqliteTable("ai_import", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  ok: integer("ok", { mode: "boolean" }).notNull().default(false),
});

export type Meal = typeof meals.$inferSelect;
export type MealIngredient = typeof mealIngredients.$inferSelect;
export type Food = typeof foods.$inferSelect;

/** Small key/value table for one-off app state (e.g. whether seed data was loaded). */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
