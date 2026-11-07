import { describe, expect, it } from "vitest";
import { ROBIN, SAM, setup, signIn } from "./helpers.js";
import { seedIfNeeded } from "../src/seed.js";
import { createMeal, listMeals, type IngredientInput, type MealInput } from "../src/services/meals.js";
import { getList, listStaples } from "../src/services/shopping.js";
import { users } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const ing = (name: string, quantity: number | null, unit: IngredientInput["unit"], category: IngredientInput["category"]): IngredientInput => ({
  name, quantity, unit, category, kcal: null, proteinG: null, fibreG: null,
});

function meal(name: string, servings: number, ingredients: IngredientInput[]): MealInput {
  return {
    name, slot: "dinner", tags: [], servingsInRecipe: servings, method: "", source: "", kcal: 450, proteinG: 40, fibreG: 10,
    nutritionStatus: "manual", assumptions: [], notes: "", ingredients,
  };
}

async function ready() {
  const t = setup();
  seedIfNeeded(t.deps.db);
  const client = await signIn(t);
  const robin = t.deps.db.select().from(users).where(eq(users.email, ROBIN)).get()!;
  const sumac = createMeal(t.deps.db, meal("Sumac chicken", 2, [
    ing("Chicken breast", 350, "g", "meat_fish"),
    ing("Chickpeas, 400 g tin (drained)", 1, "whole", "pantry"),
    ing("Feta", 60, "g", "dairy"),
    ing("Baby spinach", 120, "g", "produce"),
    ing("Sumac", 2, "tsp", "pantry"),
    ing("Olive oil", 1, "tbsp", "pantry"),
    ing("Lemon", 0.5, "whole", "produce"),
  ]), robin.id);
  const snapper = createMeal(t.deps.db, meal("Snapper and beans", 2, [
    ing("Snapper fillets", 300, "g", "meat_fish"),
    ing("Cannellini beans, 400 g tin", 1, "whole", "pantry"),
    ing("Fresh baby spinach", 100, "g", "produce"),
    ing("Lemon", 1, "whole", "produce"),
    ing("Salt", null, "whole", "pantry"),
  ]), robin.id);
  const oats = listMeals(t.deps.db).find((m) => m.name === "Overnight oats")!;
  const day = async (name: string, entries: [number, string, string][]) => {
    const res = await client.post("/days", { name, date: "" });
    const id = Number(res.headers.get("location")!.split("/").pop());
    for (const [mealId, slot, amount] of entries) await client.post(`/days/${id}/entries`, { slot, meal_id: String(mealId), amount });
    return id;
  };
  return { t, client, robin, sumac, snapper, oats, day };
}

describe("shopping list", () => {
  it("turns two days of meals into one clean combined list", async () => {
    const { t, client, robin, sumac, snapper, oats, day } = await ready();
    const mon = await day("Monday", [[oats.id, "breakfast", "1"], [sumac, "dinner", "1"]]);
    const tue = await day("Tuesday", [[oats.id, "breakfast", "1"], [snapper, "dinner", "1"]]);

    const res = await client.post("/shopping", { day: [String(mon), String(tue)], people: "2" });
    expect(res.status).toBe(303);
    const id = Number(res.headers.get("location")!.split("/").pop()!.split("?")[0]);
    const list = getList(t.deps.db, robin.id, id)!;
    const find = (name: string) => list.items.filter((i) => i.name.toLowerCase().includes(name.toLowerCase()));

    expect(list.name).toBe("Shopping: Monday, Tuesday");
    // Oats: 40 g × 2 people × 2 days = 160 g -> 200 g (rounded up to 50 g).
    expect(find("rolled oats")[0]).toMatchObject({ quantity: 200, unit: "g", category: "pantry" });
    // Milk: (150 + 100 coffee) × 2 × 2 = 1000 ml -> 1 L, merged across the two lines.
    expect(find("anchor protein milk")).toHaveLength(1);
    expect(find("anchor protein milk")[0]).toMatchObject({ quantity: 1, unit: "L" });
    // Spinach merged across both dinners: 120 + 100 = 220 g -> 250 g.
    expect(find("spinach")).toHaveLength(1);
    expect(find("spinach")[0]).toMatchObject({ quantity: 250, unit: "g", category: "produce" });
    // Lemons: 0.5 + 1 = 1.5 -> 2 whole.
    expect(find("lemon")[0]).toMatchObject({ quantity: 2, unit: "" });
    // Spices keep spoons: sumac 2 tsp (and counts as a "spices" staple).
    expect(find("sumac")[0]).toMatchObject({ quantity: 2, unit: "tsp", isStaple: true });
    // Cinnamon (spice), olive oil and salt are pantry staples.
    expect(find("cinnamon")[0]!.isStaple).toBe(true);
    expect(find("olive oil")[0]!.isStaple).toBe(true);
    expect(find("salt")[0]!.isStaple).toBe(true);
    expect(find("chicken breast")[0]!.isStaple).toBe(false);

    const html = await (await client.get(`/shopping/${id}`)).text();
    expect(html).toContain("Show pantry staples (4 hidden)");
    expect(html).not.toContain("Olive oil");
    expect(html.indexOf("Produce")).toBeLessThan(html.indexOf("Meat and fish"));
    const withStaples = await (await client.get(`/shopping/${id}?staples=1`)).text();
    expect(withStaples).toContain("Olive oil");
  });

  it("scales a single meal by the number of people", async () => {
    const { t, client, robin, sumac } = await ready();
    const res = await client.post("/shopping", { meal: String(sumac), people: "4" });
    const id = Number(res.headers.get("location")!.split("/").pop()!.split("?")[0]);
    const list = getList(t.deps.db, robin.id, id)!;
    // Recipe serves 2, 4 people -> double: 700 g chicken.
    expect(list.items.find((i) => i.name === "Chicken breast")).toMatchObject({ quantity: 700, unit: "g" });
    expect(list.people).toBe(4);
  });

  it("warns about meals with no ingredient list", async () => {
    const { client, t: setupT, robin } = await ready();
    const tandooriId = createMeal(setupT.deps.db, meal("Mystery stew", 2, []), robin.id);
    const res = await client.post("/shopping", { meal: [String(tandooriId)], people: "2" });
    const page = await (await client.get(res.headers.get("location")!)).text();
    expect(page).toContain("have no ingredient list yet");
  });

  it("ticks items off and copies as text", async () => {
    const { t, client, robin, sumac } = await ready();
    const res = await client.post("/shopping", { meal: String(sumac), people: "2" });
    const id = Number(res.headers.get("location")!.split("/").pop()!.split("?")[0]);
    const feta = getList(t.deps.db, robin.id, id)!.items.find((i) => i.name === "Feta")!;
    const json = await client.postJson(`/shopping/${id}/items/${feta.id}`, {});
    expect(json.status).toBe(200); // JSON body has no "checked" field -> unchecked
    const tick = await client.post(`/shopping/${id}/items/${feta.id}`, { checked: "1" });
    expect(tick.status).toBe(303);
    expect(getList(t.deps.db, robin.id, id)!.items.find((i) => i.id === feta.id)!.checked).toBe(true);
    const html = await (await client.get(`/shopping/${id}`)).text();
    const text = html.match(/<textarea id="list-text"[^>]*>([\s\S]*?)<\/textarea>/)![1]!;
    expect(text).toContain("MEAT AND FISH");
    expect(text).toContain("- Chicken breast, 350 g");
    expect(text).not.toContain("Feta"); // ticked items drop off the text
  });

  it("requires a selection", async () => {
    const { client } = await ready();
    const res = await client.post("/shopping", { people: "2" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Pick at least one day or meal");
  });

  it("keeps lists private", async () => {
    const { t, client, sumac } = await ready();
    const res = await client.post("/shopping", { meal: String(sumac), people: "2" });
    const path = res.headers.get("location")!.split("?")[0]!;
    const sam = await signIn(t, SAM);
    expect((await sam.get(path)).status).toBe(404);
  });

  it("seeds and edits pantry staples per user", async () => {
    const { t, client, robin } = await ready();
    expect(listStaples(t.deps.db, robin.id).map((s) => s.name)).toEqual(
      ["Bay leaves", "Butter", "Dried herbs", "Flour", "Olive oil", "Pepper", "Salt", "Spices", "Sugar"],
    );
    await client.post("/settings/staples", { name: "Soy sauce" });
    await client.post("/settings/staples", { name: "soy sauce" }); // duplicate ignored
    const butter = listStaples(t.deps.db, robin.id).find((s) => s.name === "Butter")!;
    await client.post(`/settings/staples/${butter.id}/delete`);
    const names = listStaples(t.deps.db, robin.id).map((s) => s.name);
    expect(names).toContain("Soy sauce");
    expect(names).not.toContain("Butter");
    expect(names.filter((n) => n.toLowerCase() === "soy sauce")).toHaveLength(1);
  });
});
