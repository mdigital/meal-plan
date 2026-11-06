import { describe, expect, it } from "vitest";
import { AnthropicRecipeParser, aiRecipeToMeal } from "../src/ai/parser.js";
import { findMismatches, perServeFromLines } from "../src/lib/nutrition.js";
import { RECIPE_FIXTURES } from "./fixtures/recipes.js";

// Calls the real API. Run with: RUN_AI_TESTS=1 ANTHROPIC_API_KEY=... npx vitest run tests/ai-live.test.ts
const live = process.env.RUN_AI_TESTS === "1" && !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!live)("AI import against the fixture recipes (live)", () => {
  const parser = new AnthropicRecipeParser(process.env.ANTHROPIC_API_KEY ?? "");
  for (const fx of RECIPE_FIXTURES) {
    it(`${fx.name} lands in the expected ranges`, { timeout: 180_000 }, async () => {
      const meal = aiRecipeToMeal(await parser.parse(fx.text), fx.text);
      console.log(`${fx.name}: ${meal.kcal} kcal, ${meal.proteinG} g protein, ${meal.fibreG} g fibre, serves ${meal.servingsInRecipe}`);
      expect(meal.servingsInRecipe).toBe(fx.servings);
      expect(meal.kcal).toBeGreaterThanOrEqual(fx.kcal[0]);
      expect(meal.kcal).toBeLessThanOrEqual(fx.kcal[1]);
      expect(meal.proteinG).toBeGreaterThanOrEqual(fx.protein[0]);
      expect(meal.proteinG).toBeLessThanOrEqual(fx.protein[1]);
      expect(meal.fibreG).toBeGreaterThanOrEqual(fx.fibre[0]);
      expect(meal.fibreG).toBeLessThanOrEqual(fx.fibre[1]);
      expect(findMismatches(meal, perServeFromLines(meal.ingredients, meal.servingsInRecipe))).toEqual([]);
      for (const ing of meal.ingredients) expect(["g", "kg", "ml", "L", "tsp", "tbsp", "whole"]).toContain(ing.unit);
    });
  }
});
