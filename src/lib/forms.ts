import { z } from "zod";
import { CATEGORIES, NUTRITION_STATUSES, SLOTS, UNITS } from "../db/schema.js";
import type { FoodInput, IngredientInput, MealInput } from "../services/meals.js";

export type FormBody = Record<string, string | File | (string | File)[]>;

export function str(body: FormBody, key: string): string {
  const v = body[key];
  const first = Array.isArray(v) ? v[0] : v;
  return typeof first === "string" ? first : "";
}

export function strs(body: FormBody, key: string): string[] {
  const v = body[key] ?? body[`${key}[]`];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => (typeof x === "string" ? x : ""));
}

/** Parses "12", "12.5", "12,5" and "" (null). Returns NaN for junk so validation can complain. */
export function num(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const t of raw.split(",")) {
    const tag = t.trim().toLowerCase().replace(/\s+/g, " ");
    if (tag && tag.length <= 40) seen.add(tag);
  }
  return [...seen].slice(0, 20);
}

const nonNeg = z.number().finite().min(0).max(100000);
const optNonNeg = nonNeg.nullable();

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: optNonNeg,
  unit: z.enum(UNITS),
  category: z.enum(CATEGORIES),
  kcal: optNonNeg,
  proteinG: optNonNeg,
  fibreG: optNonNeg,
});

export const mealInputSchema = z.object({
  name: z.string().trim().min(1, "Give the meal a name").max(200),
  slot: z.enum(SLOTS),
  tags: z.array(z.string()),
  servingsInRecipe: z.number().finite().gt(0, "Servings must be more than 0").max(100),
  method: z.string().max(20000),
  source: z.string().max(50000),
  kcal: nonNeg,
  proteinG: nonNeg,
  fibreG: nonNeg,
  nutritionStatus: z.enum(NUTRITION_STATUSES),
  assumptions: z.array(z.string().max(500)).max(30),
  notes: z.string().max(5000),
  ingredients: z.array(ingredientSchema).max(100),
});

export type ParsedForm<T> = { ok: true; value: T } | { ok: false; errors: string[]; draft: T };

function issues(err: z.ZodError): string[] {
  return err.issues.map((i) => {
    const path = i.path.join(".");
    if (path.startsWith("ingredients.")) return `Ingredient ${Number(i.path[1]) + 1}: ${i.message}`;
    return i.message.startsWith("Expected") || i.message.startsWith("Number") || i.message.startsWith("Too")
      ? `${path}: ${i.message}`
      : i.message;
  });
}

/**
 * Reads the meal form. nutrition_status: a meal that came from the AI keeps
 * "ai_estimate" only while its per-serve numbers are unchanged; otherwise "edited".
 */
export function parseMealForm(body: FormBody): ParsedForm<MealInput> {
  const names = strs(body, "ing_name");
  const qtys = strs(body, "ing_qty");
  const units = strs(body, "ing_unit");
  const cats = strs(body, "ing_cat");
  const kcals = strs(body, "ing_kcal");
  const prots = strs(body, "ing_protein");
  const fibres = strs(body, "ing_fibre");
  const ingredients: IngredientInput[] = [];
  names.forEach((name, i) => {
    if (!name.trim()) return;
    ingredients.push({
      name: name.trim(),
      quantity: num(qtys[i] ?? ""),
      unit: (units[i] || "whole") as IngredientInput["unit"],
      category: (cats[i] || "other") as IngredientInput["category"],
      kcal: num(kcals[i] ?? ""),
      proteinG: num(prots[i] ?? ""),
      fibreG: num(fibres[i] ?? ""),
    });
  });

  const kcal = num(str(body, "kcal")) ?? 0;
  const proteinG = num(str(body, "protein")) ?? 0;
  const fibreG = num(str(body, "fibre")) ?? 0;

  const from = str(body, "status_from");
  let nutritionStatus: MealInput["nutritionStatus"] = "manual";
  if (from === "ai_estimate" || from === "edited") {
    const orig = str(body, "orig_totals").split("|").map(Number);
    const same = orig.length === 3 && orig[0] === kcal && orig[1] === proteinG && orig[2] === fibreG;
    nutritionStatus = from === "ai_estimate" && same ? "ai_estimate" : "edited";
  }

  const candidate = {
    name: str(body, "name"),
    slot: str(body, "slot") || "dinner",
    tags: parseTags(str(body, "tags")),
    servingsInRecipe: num(str(body, "servings")) ?? 1,
    method: str(body, "method").replace(/\r\n/g, "\n").trim(),
    source: str(body, "source").replace(/\r\n/g, "\n"),
    kcal,
    proteinG,
    fibreG,
    nutritionStatus,
    assumptions: strs(body, "assumption").map((s) => s.trim()).filter(Boolean),
    notes: str(body, "notes").trim(),
    ingredients,
  };
  const r = mealInputSchema.safeParse(candidate);
  if (r.success) return { ok: true, value: r.data };
  const draft = {
    ...candidate,
    slot: candidate.slot as MealInput["slot"],
    servingsInRecipe: Number.isFinite(candidate.servingsInRecipe) ? candidate.servingsInRecipe : 1,
  };
  return { ok: false, errors: issues(r.error), draft };
}

const foodSchema = z.object({
  name: z.string().trim().min(1, "Give the food a name").max(200),
  unit: z.enum(["g", "ml"]),
  defaultAmount: z.number().finite().gt(0, "Usual amount must be more than 0").max(10000),
  kcalPer100: nonNeg,
  proteinPer100: nonNeg,
  fibrePer100: nonNeg,
  category: z.enum(CATEGORIES),
  notes: z.string().max(5000),
});

export function parseFoodForm(body: FormBody): ParsedForm<FoodInput> {
  const candidate = {
    name: str(body, "name"),
    unit: str(body, "unit") || "g",
    defaultAmount: num(str(body, "default_amount")) ?? 100,
    kcalPer100: num(str(body, "kcal")) ?? 0,
    proteinPer100: num(str(body, "protein")) ?? 0,
    fibrePer100: num(str(body, "fibre")) ?? 0,
    category: str(body, "category") || "other",
    notes: str(body, "notes").trim(),
  };
  const r = foodSchema.safeParse(candidate);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: issues(r.error), draft: candidate as FoodInput };
}
