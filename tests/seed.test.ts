import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setup } from "./helpers.js";
import { SEED_MEALS, seedIfNeeded, upgradeSeedRecipes } from "../src/seed.js";
import { createFood, createMeal, getMeal, listMeals, updateMeal } from "../src/services/meals.js";
import { appMeta, foods } from "../src/db/schema.js";
import { findMismatches, perServeFromLines } from "../src/lib/nutrition.js";

/** Recreates a library seeded by the first version: names and numbers only, no recipes. */
function oldStyleLibrary() {
  const t = setup();
  const db = t.deps.db;
  for (const m of SEED_MEALS) {
    createMeal(db, {
      name: m.name, slot: m.slot, tags: m.tags.slice(0, 2), servingsInRecipe: 1, method: "", source: "",
      kcal: m.kcal, proteinG: m.name.startsWith("Sumac") ? 48 - 2 : m.proteinG, fibreG: m.fibreG,
      nutritionStatus: "manual", assumptions: [], notes: "Starting estimate.", ingredients: [],
    }, null);
  }
  createFood(db, { name: "Kalo Greek yoghurt", unit: "g", defaultAmount: 100, kcalPer100: 88, proteinPer100: 9.3, fibrePer100: 0, category: "dairy", notes: "" }, null);
  createFood(db, { name: "Mixed berries", unit: "g", defaultAmount: 75, kcalPer100: 50, proteinPer100: 1, fibrePer100: 4, category: "frozen", notes: "edited" }, null);
  db.insert(appMeta).values({ key: "seeded", value: "old" }).run();
  return t;
}

const byName = (t: ReturnType<typeof setup>, name: string) => listMeals(t.deps.db).find((m) => m.name === name);

describe("seed recipes", () => {
  it("every recipe's ingredient lines agree with its totals where they carry nutrition", () => {
    for (const m of SEED_MEALS) {
      const fromLines = perServeFromLines(m.ingredients, m.servings);
      expect(findMismatches(m, fromLines), m.name).toEqual([]);
      expect(m.ingredients.length, m.name).toBeGreaterThan(0);
      expect(m.method, m.name).not.toBe("");
    }
  });

  it("a fresh library gets the full recipes", () => {
    const t = setup();
    seedIfNeeded(t.deps.db);
    const bowl = getMeal(t.deps.db, byName(t, "Chicken, mushroom and broccolini bowl")!.id)!;
    expect(bowl.servingsInRecipe).toBe(4);
    expect(bowl.ingredients.find((i) => i.name === "Chicken thigh, skinless")!.quantity).toBe(700);
    expect(bowl.source).toContain("brown it hard");
    expect(upgradeSeedRecipes(t.deps.db)).toBeNull(); // nothing to upgrade
    expect(listMeals(t.deps.db).some((m) => m.name.toLowerCase().includes("hoki"))).toBe(false);
  });

  it("upgrades an old library without losing edits", () => {
    const t = oldStyleLibrary();
    const db = t.deps.db;
    // The user edited the kimchi dish's numbers, pasted their own snapper recipe, and deleted the sardines.
    const kimchi = getMeal(db, byName(t, "Kimchi, corn and bacon on cauliflower, with an egg")!.id)!;
    updateMeal(db, kimchi.id, { ...kimchi, proteinG: 38, notes: "Two eggs for us" });
    const snapper = getMeal(db, byName(t, "Snapper and white beans")!.id)!;
    updateMeal(db, snapper.id, { ...snapper, source: "My own snapper recipe", ingredients: [{ name: "Snapper", quantity: 400, unit: "g", category: "meat_fish", kcal: null, proteinG: null, fibreG: null }] });
    db.$client.exec("delete from meal where name = 'Sardines with white beans and fennel'");

    const report = upgradeSeedRecipes(db)!;
    expect(report.replaced).toContain("Overnight oats");
    expect(report.replaced).toContain("Sumac chicken, chickpeas, feta and spinach");
    expect(report.addedIngredients).toEqual(["Kimchi, corn and bacon on cauliflower, with an egg"]);
    expect(report.skipped).toEqual(["Snapper and white beans"]);

    // Untouched: full recipe, per-line figures and the checked numbers.
    const sumac = getMeal(db, byName(t, "Sumac chicken, chickpeas, feta and spinach")!.id)!;
    expect([sumac.kcal, sumac.proteinG, sumac.fibreG]).toEqual([460, 48, 12]);
    expect(sumac.servingsInRecipe).toBe(2);
    expect(sumac.ingredients).toHaveLength(11);
    const lunch = getMeal(db, byName(t, "Chicken, lentil and kale salad")!.id)!;
    expect(lunch.ingredients.reduce((s, i) => s + (i.kcal ?? 0), 0)).toBe(468);
    expect(lunch.ingredients.some((i) => i.name.toLowerCase().includes("olive oil"))).toBe(false);

    // Edited: ingredients added, the user's numbers and notes kept.
    const kimchiAfter = getMeal(db, kimchi.id)!;
    expect(kimchiAfter.proteinG).toBe(38);
    expect(kimchiAfter.notes).toBe("Two eggs for us");
    expect(kimchiAfter.ingredients.find((i) => i.name === "Eggs")!.quantity).toBe(4);
    expect(kimchiAfter.servingsInRecipe).toBe(4);

    // Pasted recipe left alone; deleted meal not recreated.
    expect(getMeal(db, snapper.id)!.source).toBe("My own snapper recipe");
    expect(byName(t, "Sardines with white beans and fennel")).toBeUndefined();

    // Foods: untouched seed values updated, edited ones kept.
    const kalo = db.select().from(foods).where(eq(foods.name, "Kalo Greek yoghurt")).get()!;
    expect([kalo.kcalPer100, kalo.proteinPer100]).toEqual([90, 9]);
    const berries = db.select().from(foods).where(eq(foods.name, "Mixed berries")).get()!;
    expect(berries.kcalPer100).toBe(50);

    // Runs once.
    expect(upgradeSeedRecipes(db)).toBeNull();
  });
});
