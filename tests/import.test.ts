import { describe, expect, it } from "vitest";
import { setup, signIn } from "./helpers.js";
import { aiRecipeSchema, aiRecipeToMeal, normaliseCategory, normaliseSlot, normaliseUnit, RecipeParseError, type AiRecipe, type RecipeParser } from "../src/ai/parser.js";
import { listMeals, getMeal } from "../src/services/meals.js";

const goodRecipe: AiRecipe = {
  is_recipe: true,
  name: "Snapper and white beans",
  slot: "dinner",
  servings: 2,
  tags: ["Fish", "beans"],
  ingredients: [
    { name: "Snapper fillets", quantity: 300, unit: "g", category: "meat_fish", kcal: 300, protein_g: 66, fibre_g: 0 },
    { name: "Cannellini beans, 400 g tin (drained)", quantity: 1, unit: "whole", category: "pantry", kcal: 260, protein_g: 18, fibre_g: 16 },
    { name: "Baby spinach", quantity: 100, unit: "grams", category: "produce", kcal: 23, protein_g: 2.9, fibre_g: 2.2 },
  ],
  per_serve: { kcal: 291.5, protein_g: 43.45, fibre_g: 9.1 },
  method: "1. Cook.\n2. Eat.",
  assumptions: ["Snapper weight assumed as 300 g total."],
};

class FakeParser implements RecipeParser {
  calls: string[] = [];
  constructor(private result: AiRecipe | Error = goodRecipe) {}
  async parse(text: string) {
    this.calls.push(text);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("AI schema validation", () => {
  it("accepts a well-formed response", () => {
    expect(aiRecipeSchema.safeParse(goodRecipe).success).toBe(true);
  });

  it("rejects malformed responses", () => {
    expect(aiRecipeSchema.safeParse({ ...goodRecipe, per_serve: { kcal: "lots" } }).success).toBe(false);
    expect(aiRecipeSchema.safeParse({ ...goodRecipe, ingredients: [{ name: "x" }] }).success).toBe(false);
    expect(aiRecipeSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("normalises units, slots and categories", () => {
    expect(normaliseUnit("Tablespoons")).toBe("tbsp");
    expect(normaliseUnit("l")).toBe("L");
    expect(normaliseUnit("cup")).toBe("whole");
    expect(normaliseSlot("Morning tea")).toBe("morning_tea");
    expect(normaliseSlot("brunch")).toBe("other");
    expect(normaliseCategory("meat and fish")).toBe("meat_fish");
    expect(normaliseCategory("deli")).toBe("other");
  });

  it("tidies the model output into a meal", () => {
    const meal = aiRecipeToMeal({ ...goodRecipe, servings: -1, per_serve: { kcal: 291.6, protein_g: -3, fibre_g: 9.14 } }, "src");
    expect(meal.servingsInRecipe).toBe(1);
    expect(meal.kcal).toBe(292);
    expect(meal.proteinG).toBe(0);
    expect(meal.fibreG).toBe(9.1);
    expect(meal.tags).toEqual(["fish", "beans"]);
    expect(meal.ingredients[2]!.unit).toBe("g");
    expect(meal.nutritionStatus).toBe("ai_estimate");
    expect(meal.source).toBe("src");
  });
});

describe("import flow", () => {
  it("shows an editable review, labelled as an estimate, and saves it", async () => {
    const parser = new FakeParser();
    const t = setup({ parser });
    const client = await signIn(t);
    const res = await client.post("/import", { recipe: "Snapper, beans, spinach. Serves 2." });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Check the meal");
    expect(html).toContain("estimate");
    expect(html).toContain("Snapper weight assumed");
    expect(html).toContain('value="Cannellini beans, 400 g tin (drained)"');
    expect(html).not.toContain("data-mismatch");
    expect(listMeals(t.deps.db)).toHaveLength(0); // nothing saved yet
    expect(parser.calls).toEqual(["Snapper, beans, spinach. Serves 2."]);

    // Save as reviewed (same numbers) keeps the AI label.
    const save = await client.post("/meals", {
      name: "Snapper and white beans",
      slot: "dinner",
      servings: "2",
      tags: "fish, beans",
      kcal: "292",
      protein: "43.5",
      fibre: "9.1",
      method: "1. Cook.",
      notes: "",
      source: "Snapper, beans, spinach. Serves 2.",
      status_from: "ai_estimate",
      orig_totals: "292|43.5|9.1",
      assumption: ["Snapper weight assumed as 300 g total."],
      ing_name: ["Snapper fillets"],
      ing_qty: ["300"],
      ing_unit: ["g"],
      ing_cat: ["meat_fish"],
      ing_kcal: ["300"],
      ing_protein: ["66"],
      ing_fibre: ["0"],
    });
    expect(save.status).toBe(303);
    const meal = listMeals(t.deps.db)[0]!;
    expect(meal.nutritionStatus).toBe("ai_estimate");
    expect(meal.assumptions).toEqual(["Snapper weight assumed as 300 g total."]);
    expect(meal.source).toContain("Snapper, beans");
  });

  it("flags totals that don't match the ingredient lines", async () => {
    const t = setup({ parser: new FakeParser({ ...goodRecipe, per_serve: { kcal: 600, protein_g: 43, fibre_g: 9 } }) });
    const client = await signIn(t);
    const html = await (await client.post("/import", { recipe: "x" })).text();
    expect(html).toContain("data-mismatch");
    expect(html).toContain("Check these totals");
  });

  it("enforces the daily cap", async () => {
    const parser = new FakeParser();
    const t = setup({ parser }); // cap is 3 in tests
    const client = await signIn(t);
    for (let i = 0; i < 3; i++) expect((await client.post("/import", { recipe: "x" })).status).toBe(200);
    const blocked = await client.post("/import", { recipe: "x" });
    expect(blocked.status).toBe(422);
    expect(await blocked.text()).toContain("used all 3");
    expect(parser.calls).toHaveLength(3);
    t.advance(24 * 60 * 60 * 1000 + 1);
    expect((await client.post("/import", { recipe: "x" })).status).toBe(200);
  });

  it("counts the cap per user", async () => {
    const parser = new FakeParser();
    const t = setup({ parser });
    const robin = await signIn(t, "robin@example.com");
    const sam = await signIn(t, "sam@example.com");
    for (let i = 0; i < 3; i++) await robin.post("/import", { recipe: "x" });
    expect((await sam.post("/import", { recipe: "x" })).status).toBe(200);
  });

  it("explains failures and keeps the pasted text", async () => {
    const t = setup({ parser: new FakeParser(new RecipeParseError("boom", "The AI service is busy. Try again in a minute.")) });
    const client = await signIn(t);
    const res = await client.post("/import", { recipe: "My recipe text" });
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("The AI service is busy");
    expect(html).toContain("My recipe text");
  });

  it("rejects non-recipes and empty or huge pastes", async () => {
    const parser = new FakeParser({ ...goodRecipe, is_recipe: false });
    const t = setup({ parser });
    const client = await signIn(t);
    expect(await (await client.post("/import", { recipe: "hello" })).text()).toContain("doesn&#39;t look like a recipe");
    expect((await client.post("/import", { recipe: "   " })).status).toBe(422);
    expect((await client.post("/import", { recipe: "x".repeat(20001) })).status).toBe(422);
    expect(parser.calls).toHaveLength(1);
  });

  it("works without an API key, pointing to manual entry", async () => {
    const t = setup();
    const client = await signIn(t);
    const html = await (await client.get("/import")).text();
    expect(html).toContain("isn&#39;t set up");
    expect(html).toContain("/meals/new");
  });

  it("re-estimates a saved meal from its stored recipe text", async () => {
    const parser = new FakeParser();
    const t = setup({ parser });
    const client = await signIn(t);
    const created = await client.post("/meals", {
      name: "My snapper", slot: "dinner", servings: "2", tags: "", kcal: "1", protein: "1", fibre: "1", method: "", notes: "",
      source: "original pasted text", status_from: "manual", orig_totals: "0|0|0",
    });
    const id = Number(created.headers.get("location")!.split("/").pop()!.split("?")[0]);
    const res = await client.post(`/meals/${id}/reestimate`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('value="My snapper"');
    expect(html).toContain(`action="/meals/${id}"`);
    expect(parser.calls).toEqual(["original pasted text"]);
    expect(getMeal(t.deps.db, id)!.kcal).toBe(1); // unchanged until saved
  });
});
