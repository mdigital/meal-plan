import { eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { appMeta, meals, type Slot } from "./db/schema.js";
import { createFood, createMeal, type FoodInput, type IngredientInput } from "./services/meals.js";

type SeedMeal = {
  name: string;
  slot: Slot;
  kcal: number;
  proteinG: number;
  fibreG: number;
  tags: string[];
  ingredients?: IngredientInput[];
  notes?: string;
};

const ing = (name: string, quantity: number | null, unit: IngredientInput["unit"], category: IngredientInput["category"]): IngredientInput => ({
  name,
  quantity,
  unit,
  category,
  kcal: null,
  proteinG: null,
  fibreG: null,
});

const COFFEE = "Includes a coffee made with 100 ml Anchor Protein milk.";
const ESTIMATE = "Starting estimate. Paste the full recipe into Import to recalculate.";

export const SEED_MEALS: SeedMeal[] = [
  {
    name: "Overnight oats",
    slot: "breakfast",
    kcal: 391,
    proteinG: 26,
    fibreG: 8.5,
    tags: ["oats", "make ahead"],
    notes: COFFEE,
    ingredients: [
      ing("Rolled oats", 40, "g", "pantry"),
      ing("Chia seeds", 12, "g", "pantry"),
      ing("Kalo Greek yoghurt", 50, "g", "dairy"),
      ing("Anchor Protein milk", 150, "ml", "dairy"),
      ing("Ground cinnamon", 0.5, "tsp", "pantry"),
      ing("Anchor Protein milk (coffee)", 100, "ml", "dairy"),
    ],
  },
  {
    name: "Egg sandwich",
    slot: "breakfast",
    kcal: 395,
    proteinG: 26,
    fibreG: 5,
    tags: ["eggs", "quick"],
    notes: COFFEE,
    ingredients: [
      ing("Vogel's Original bread", 2, "whole", "bakery"),
      ing("Eggs", 2, "whole", "dairy"),
      ing("Anchor Protein milk (coffee)", 100, "ml", "dairy"),
    ],
  },
  {
    name: "Avocado toast",
    slot: "breakfast",
    kcal: 375,
    proteinG: 15.5,
    fibreG: 10,
    tags: ["quick", "vegetarian"],
    notes: COFFEE,
    ingredients: [
      ing("Vogel's Original bread", 2, "whole", "bakery"),
      ing("Avocado", 0.5, "whole", "produce"),
      ing("Anchor Protein milk (coffee)", 100, "ml", "dairy"),
    ],
  },
  {
    name: "Whey in water",
    slot: "morning_tea",
    kcal: 58,
    proteinG: 12,
    fibreG: 0,
    tags: ["quick"],
    ingredients: [ing("Whey protein powder", 15, "g", "pantry")],
  },
  {
    name: "Chicken, lentil and kale salad",
    slot: "lunch",
    kcal: 468,
    proteinG: 46,
    fibreG: 11,
    tags: ["chicken", "lentils", "kale", "salad"],
    notes: "No olive oil.",
  },
  {
    name: "Kalo yoghurt with berries",
    slot: "snack",
    kcal: 123,
    proteinG: 10,
    fibreG: 3,
    tags: ["after dinner", "quick", "yoghurt"],
    ingredients: [ing("Kalo Greek yoghurt", 100, "g", "dairy"), ing("Mixed berries", 75, "g", "frozen")],
  },
  { name: "Chicken, mushroom and broccolini bowl", slot: "dinner", kcal: 445, proteinG: 42, fibreG: 12, tags: ["chicken"] },
  { name: "Kimchi, corn and bacon on cauliflower, with an egg", slot: "dinner", kcal: 420, proteinG: 32, fibreG: 8, tags: ["kimchi", "eggs"] },
  { name: "Vietnamese chicken salad", slot: "dinner", kcal: 430, proteinG: 40, fibreG: 7, tags: ["chicken", "salad"] },
  { name: "Snapper and white beans", slot: "dinner", kcal: 402, proteinG: 48, fibreG: 14, tags: ["fish", "beans"] },
  { name: "Tandoori chicken and dal", slot: "dinner", kcal: 478, proteinG: 52, fibreG: 12, tags: ["chicken", "lentils"] },
  { name: "Lemon-herb chicken with roasted veg", slot: "dinner", kcal: 421, proteinG: 45, fibreG: 12, tags: ["chicken", "tray bake"] },
  { name: "Miso salmon with greens and edamame", slot: "dinner", kcal: 470, proteinG: 42, fibreG: 8, tags: ["salmon", "fish"] },
  { name: "Sumac chicken, chickpeas, feta and spinach", slot: "dinner", kcal: 460, proteinG: 48, fibreG: 12, tags: ["chicken", "chickpeas", "feta"] },
  { name: "Halloumi, white beans and roasted veg", slot: "dinner", kcal: 450, proteinG: 32, fibreG: 11, tags: ["halloumi", "beans", "vegetarian"] },
  { name: "Sardines with white beans and fennel", slot: "dinner", kcal: 490, proteinG: 39, fibreG: 10, tags: ["sardines", "fish", "beans"] },
  { name: "Crispy miso tofu with sesame greens", slot: "dinner", kcal: 450, proteinG: 41, fibreG: 8, tags: ["tofu", "vegetarian"] },
];

/** Approximate label values; check against the packs. */
export const SEED_FOODS: FoodInput[] = [
  { name: "Kalo Greek yoghurt", unit: "g", defaultAmount: 100, kcalPer100: 88, proteinPer100: 9.3, fibrePer100: 0, category: "dairy", notes: "Approximate. Check the label." },
  { name: "Whey protein powder", unit: "g", defaultAmount: 15, kcalPer100: 387, proteinPer100: 80, fibrePer100: 0, category: "pantry", notes: "Approximate. Check the label." },
  { name: "Anchor Protein milk", unit: "ml", defaultAmount: 100, kcalPer100: 58, proteinPer100: 5.5, fibrePer100: 0, category: "dairy", notes: "Approximate. Check the label." },
  { name: "Mixed berries", unit: "g", defaultAmount: 75, kcalPer100: 47, proteinPer100: 0.9, fibrePer100: 4, category: "frozen", notes: "Approximate." },
];

/** Loads the seed library once. Safe to call on every start. */
export function seedIfNeeded(db: Db, userId: number | null = null): boolean {
  const done = db.select().from(appMeta).where(eq(appMeta.key, "seeded")).get();
  if (done) return false;
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    const existing = new Set(t.select({ name: meals.name }).from(meals).all().map((m) => m.name));
    for (const m of SEED_MEALS) {
      if (existing.has(m.name)) continue;
      createMeal(
        t,
        {
          name: m.name,
          slot: m.slot,
          tags: m.tags,
          servingsInRecipe: 1,
          method: "",
          source: "",
          kcal: m.kcal,
          proteinG: m.proteinG,
          fibreG: m.fibreG,
          nutritionStatus: "manual",
          assumptions: [],
          notes: [m.notes, ESTIMATE].filter(Boolean).join(" "),
          ingredients: m.ingredients ?? [],
        },
        userId,
      );
    }
    for (const f of SEED_FOODS) createFood(t, f, userId);
    t.insert(appMeta).values({ key: "seeded", value: new Date().toISOString() }).run();
  });
  return true;
}
