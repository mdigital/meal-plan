import { describe, expect, it } from "vitest";
import { roundForUnit, scaleMethodText, scaleQuantity } from "../src/lib/scale.js";
import { setup, signIn } from "./helpers.js";
import { seedIfNeeded } from "../src/seed.js";
import { getMeal, listMeals } from "../src/services/meals.js";
import { parseServes } from "../src/routes/meals.js";

describe("scaling amounts", () => {
  it("rounds to measurable amounts", () => {
    expect(roundForUnit(350, "g")).toBe(350);
    expect(roundForUnit(233.33, "g")).toBe(235);
    expect(roundForUnit(22.5, "ml")).toBe(23);
    expect(roundForUnit(2.25, "g")).toBe(2.3);
    expect(roundForUnit(1.5, "whole")).toBe(1.5);
    expect(roundForUnit(0.66, "tsp")).toBe(0.75);
    expect(roundForUnit(0.05, "whole")).toBe(0.25);
    expect(roundForUnit(1.234, "kg")).toBe(1.23);
  });

  it("halves and doubles quantities", () => {
    expect(scaleQuantity(700, "g", 0.5)).toBe(350);
    expect(scaleQuantity(3, "whole", 0.5)).toBe(1.5);
    expect(scaleQuantity(1, "tbsp", 0.5)).toBe(0.5);
    expect(scaleQuantity(null, "whole", 2)).toBeNull();
  });

  it("scales measured amounts in the method but not temperatures, times or sizes", () => {
    const text = "Marinate in 45 ml fish sauce and 2 tsp sugar. Add 700g chicken. Roast at 200°C for 20 minutes in 3 cm pieces. Add 2 eggs.";
    expect(scaleMethodText(text, 0.5)).toBe(
      "Marinate in 23 ml fish sauce and 1 tsp sugar. Add 350g chicken. Roast at 200°C for 20 minutes in 3 cm pieces. Add 2 eggs.",
    );
    expect(scaleMethodText(text, 1)).toBe(text);
  });

  it("validates serves", () => {
    expect(parseServes("2")).toBe(2);
    expect(parseServes("2,5")).toBe(2.5);
    expect(parseServes("1.3")).toBe(1.5);
    expect(parseServes("0")).toBeNull();
    expect(parseServes("abc")).toBeNull();
    expect(parseServes("100")).toBeNull();
    expect(parseServes(undefined)).toBeNull();
  });
});

describe("changing a recipe's serves", () => {
  async function ready() {
    const t = setup();
    seedIfNeeded(t.deps.db);
    const client = await signIn(t);
    const bowl = listMeals(t.deps.db).find((m) => m.name === "Chicken, mushroom and broccolini bowl")!;
    return { t, client, bowl };
  }

  it("previews the recipe for another number of serves without saving", async () => {
    const { t, client, bowl } = await ready();
    const html = await (await client.get(`/meals/${bowl.id}?serves=2`)).text();
    expect(html).toContain("Showing amounts for 2 serves");
    expect(html).toContain("<b>350 g </b>Chicken thigh, skinless");
    expect(html).toContain("<b>1.5 </b>Garlic cloves");
    expect(html).toContain("Save recipe as serves 2");
    expect(getMeal(t.deps.db, bowl.id)!.servingsInRecipe).toBe(4); // unchanged
    // The current serves shows no preview.
    expect(await (await client.get(`/meals/${bowl.id}?serves=4`)).text()).not.toContain("Showing amounts");
    expect(await (await client.get(`/meals/${bowl.id}?serves=999`)).text()).not.toContain("Showing amounts");
  });

  it("saves the recipe as serves 2, keeping nutrition per serve", async () => {
    const { t, client, bowl } = await ready();
    const res = await client.post(`/meals/${bowl.id}/scale`, { servings: "2" });
    expect(res.status).toBe(303);
    const after = getMeal(t.deps.db, bowl.id)!;
    expect(after.servingsInRecipe).toBe(2);
    expect([after.kcal, after.proteinG, after.fibreG]).toEqual([bowl.kcal, bowl.proteinG, bowl.fibreG]);
    const q = (name: string) => after.ingredients.find((i) => i.name === name)!.quantity;
    expect(q("Chicken thigh, skinless")).toBe(350);
    expect(q("Soy sauce")).toBe(23);
    expect(q("Edamame, shelled")).toBe(125);
    expect(q("Sesame seeds")).toBe(1.5);
    expect(after.ingredients.find((i) => i.name === "Sesame seeds")!.unit).toBe("tsp"); // 0.5 tbsp -> 1.5 tsp
    expect(after.method).toContain("Slice the chicken");
    expect(after.source).toBe(bowl.source); // original recipe text kept
    expect(await (await client.get(res.headers.get("location")!)).text()).toContain("Recipe saved for 2 serves");
  });

  it("scales per-line nutrition with the amounts so totals still agree", async () => {
    const { t, client } = await ready();
    const oats = listMeals(t.deps.db).find((m) => m.name === "Overnight oats")!;
    await client.post(`/meals/${oats.id}/scale`, { servings: "2" });
    const after = getMeal(t.deps.db, oats.id)!;
    expect(after.ingredients.find((i) => i.name === "Rolled oats")).toMatchObject({ quantity: 80, kcal: 296 });
    const totalKcal = after.ingredients.reduce((s, i) => s + (i.kcal ?? 0), 0);
    expect(totalKcal / 2).toBeCloseTo(391, 0);
  });

  it("rejects bad serves and missing meals", async () => {
    const { t, client, bowl } = await ready();
    await client.post(`/meals/${bowl.id}/scale`, { servings: "0" });
    expect(getMeal(t.deps.db, bowl.id)!.servingsInRecipe).toBe(4);
    expect((await client.post(`/meals/99999/scale`, { servings: "2" })).status).toBe(404);
  });
});
