import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CATEGORIES, SLOTS, UNITS, type Category, type Slot, type Unit } from "../db/schema.js";
import type { MealInput } from "../services/meals.js";

export const MODEL = "claude-sonnet-5-5";
export const MAX_RECIPE_CHARS = 20000;

/** The shape we ask the model for. Kept simple so it works with structured outputs. */
export const aiRecipeSchema = z.object({
  is_recipe: z.boolean().describe("False if the text is not a recipe or meal description."),
  name: z.string(),
  slot: z.string().describe(`One of: ${SLOTS.join(", ")}.`),
  servings: z.number().describe("How many serves the recipe makes."),
  tags: z.array(z.string()).describe("2 to 5 short lowercase tags, e.g. main protein, key legume, 'vegetarian'."),
  ingredients: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().nullable().describe("Amount for the whole recipe, in the given unit. Null if unspecified, e.g. 'salt to taste'."),
      unit: z.string().describe(`One of: ${UNITS.join(", ")}.`),
      category: z.string().describe(`One of: ${CATEGORIES.join(", ")}.`),
      kcal: z.number().describe("Energy for this line, whole recipe."),
      protein_g: z.number().describe("Protein in grams for this line, whole recipe."),
      fibre_g: z.number().describe("Dietary fibre in grams for this line, whole recipe."),
    }),
  ),
  per_serve: z.object({ kcal: z.number(), protein_g: z.number(), fibre_g: z.number() }),
  method: z.string().describe("Numbered steps, one per line. Empty string if the text has no method."),
  assumptions: z.array(z.string()).describe("Short notes on anything you assumed or estimated."),
});

export type AiRecipe = z.infer<typeof aiRecipeSchema>;

export class RecipeParseError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface RecipeParser {
  parse(recipeText: string): Promise<AiRecipe>;
}

export const SYSTEM_PROMPT = `You turn a pasted recipe into structured data for a meal-planning app used by two adults in New Zealand who track calories, protein and fibre.

Units: metric only. Convert cups, ounces, pounds and Fahrenheit to g, ml or °C. Use g for solids and ml for liquids, kg or L only for large amounts. Use tsp or tbsp for spices, dried herbs, pastes and small amounts of sauces. Use "whole" for countable items (eggs, lemons, cloves of garlic, tins, slices of bread) and put the item size in the name if it matters, e.g. "Chickpeas, 400 g tin (drained)".

Nutrition: estimate kcal, protein and dietary fibre for each ingredient line for the quantity in the whole recipe, using standard food composition values (NZ FOODfiles or USDA). For drained tinned legumes use drained weight. Use cooked or raw values consistently with how the quantity is given. Then give per-serve totals that equal the sum of the lines divided by servings. Where a quantity is missing or vague, choose a typical amount, include it in the line, and list it in assumptions. "Oil for frying" and "salt to taste" can have a quantity of null and zero nutrition unless an amount is clear.

Know these NZ products: Vogel's Original bread (about 42 g a slice, ~105 kcal, 4.5 g protein, 3 g fibre), Kalo Greek yoghurt (~88 kcal, 9.3 g protein per 100 g), Anchor Protein+ milk (~58 kcal, 5.5 g protein per 100 ml).

Categories for shopping: produce (fresh fruit, veg, herbs), meat_fish (meat, poultry, fish and seafood, including tinned fish), dairy (milk, yoghurt, cheese, butter, eggs, tofu), pantry (tins, dry goods, oils, spices, sauces, grains, legumes), frozen, bakery (bread, wraps), other.

Slot: breakfast, morning_tea, lunch, dinner, snack or other, from the recipe's nature. Servings: from the text, or a sensible guess noted in assumptions.

Keep the name short and natural. Write the method as numbered steps in plain words. Keep assumptions short and specific, at most 8. If the text is not a recipe or food, set is_recipe to false and leave the other fields minimal.`;

export class AnthropicRecipeParser implements RecipeParser {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 });
  }

  async parse(recipeText: string): Promise<AiRecipe> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        // If a safety classifier declines, the API retries on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `<recipe>\n${recipeText}\n</recipe>` }],
        output_config: { format: betaZodOutputFormat(aiRecipeSchema) },
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new RecipeParseError(String(err), "The AI service is busy. Try again in a minute.");
      }
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new RecipeParseError(String(err), "The AI service isn't set up correctly. Ask the admin to check the API key.");
      }
      if (err instanceof Anthropic.APIError) {
        throw new RecipeParseError(String(err), "The AI service had a problem. Try again, or enter the meal by hand.");
      }
      throw new RecipeParseError(String(err), "Couldn't reach the AI service. Try again, or enter the meal by hand.");
    }
    if (response.stop_reason === "refusal") {
      throw new RecipeParseError("refusal", "The AI declined to read that text. Try trimming it to just the recipe.");
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      throw new RecipeParseError(`no parsed output (${response.stop_reason})`, "The recipe was too long or unclear to read. Try a shorter paste.");
    }
    return response.parsed_output;
  }
}

const UNIT_ALIASES: Record<string, Unit> = {
  gram: "g", grams: "g", gm: "g", kilogram: "kg", kilograms: "kg", millilitre: "ml", milliliter: "ml", millilitres: "ml",
  l: "L", litre: "L", liter: "L", litres: "L", teaspoon: "tsp", teaspoons: "tsp", tablespoon: "tbsp", tablespoons: "tbsp",
  each: "whole", piece: "whole", pieces: "whole", "": "whole",
};

export function normaliseUnit(raw: string): Unit {
  const s = raw.trim();
  if ((UNITS as readonly string[]).includes(s)) return s as Unit;
  const lower = s.toLowerCase();
  if ((UNITS as readonly string[]).includes(lower)) return lower as Unit;
  return UNIT_ALIASES[lower] ?? "whole";
}

export function normaliseSlot(raw: string): Slot {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (SLOTS as readonly string[]).includes(s) ? (s as Slot) : "other";
}

export function normaliseCategory(raw: string): Category {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_").replace("meat_and_fish", "meat_fish");
  return (CATEGORIES as readonly string[]).includes(s) ? (s as Category) : "other";
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clampNum = (n: number) => (Number.isFinite(n) && n >= 0 ? n : 0);

/** Converts the model's output into the app's meal input, tidying numbers. */
export function aiRecipeToMeal(ai: AiRecipe, source: string): MealInput {
  const servings = Number.isFinite(ai.servings) && ai.servings > 0 ? Math.min(ai.servings, 100) : 1;
  return {
    name: ai.name.trim().slice(0, 200) || "Imported recipe",
    slot: normaliseSlot(ai.slot),
    tags: [...new Set(ai.tags.map((t) => t.trim().toLowerCase()).filter((t) => t && t.length <= 40))].slice(0, 8),
    servingsInRecipe: servings,
    method: ai.method.trim(),
    source,
    kcal: Math.round(clampNum(ai.per_serve.kcal)),
    proteinG: r1(clampNum(ai.per_serve.protein_g)),
    fibreG: r1(clampNum(ai.per_serve.fibre_g)),
    nutritionStatus: "ai_estimate",
    assumptions: ai.assumptions.map((a) => a.trim()).filter(Boolean).slice(0, 12),
    notes: "",
    ingredients: ai.ingredients
      .filter((i) => i.name.trim())
      .slice(0, 100)
      .map((i) => ({
        name: i.name.trim().slice(0, 200),
        quantity: i.quantity == null || !Number.isFinite(i.quantity) || i.quantity < 0 ? null : r1(i.quantity),
        unit: normaliseUnit(i.unit),
        category: normaliseCategory(i.category),
        kcal: Math.round(clampNum(i.kcal)),
        proteinG: r1(clampNum(i.protein_g)),
        fibreG: r1(clampNum(i.fibre_g)),
      })),
  };
}
