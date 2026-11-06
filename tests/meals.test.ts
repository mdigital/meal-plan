import { describe, expect, it } from "vitest";
import { ROBIN, SAM, setup, signIn } from "./helpers.js";
import { seedIfNeeded, SEED_MEALS } from "../src/seed.js";
import { getMeal, listMeals } from "../src/services/meals.js";
import { parseMealForm, parseTags, num } from "../src/lib/forms.js";
import { findMismatches, perServeFromLines } from "../src/lib/nutrition.js";

const mealForm = (over: Record<string, string | string[]> = {}) => ({
  name: "Test bowl",
  slot: "dinner",
  servings: "2",
  tags: "Chicken, quick, chicken",
  kcal: "450",
  protein: "40",
  fibre: "10",
  method: "Cook it.",
  notes: "",
  source: "",
  status_from: "manual",
  orig_totals: "0|0|0",
  ing_name: ["Chicken thigh", "Kale", ""],
  ing_qty: ["400", "100", ""],
  ing_unit: ["g", "g", "g"],
  ing_cat: ["meat_fish", "produce", "produce"],
  ing_kcal: ["", "", ""],
  ing_protein: ["", "", ""],
  ing_fibre: ["", "", ""],
  ...over,
});

describe("seed", () => {
  it("loads the brief's meals and foods once", () => {
    const t = setup();
    expect(seedIfNeeded(t.deps.db)).toBe(true);
    expect(seedIfNeeded(t.deps.db)).toBe(false);
    const meals = listMeals(t.deps.db);
    expect(meals).toHaveLength(SEED_MEALS.length);
    const snapper = meals.find((m) => m.name === "Snapper and white beans")!;
    expect([snapper.kcal, snapper.proteinG, snapper.fibreG]).toEqual([402, 48, 14]);
    expect(meals.filter((m) => m.slot === "dinner")).toHaveLength(11);
  });

  it("does not come back after the meals are deleted", () => {
    const t = setup();
    seedIfNeeded(t.deps.db);
    t.deps.db.$client.exec("delete from meal");
    seedIfNeeded(t.deps.db);
    expect(listMeals(t.deps.db)).toHaveLength(0);
  });
});

describe("meal CRUD", () => {
  it("creates, shows, edits and deletes a meal", async () => {
    const t = setup();
    const client = await signIn(t);
    const created = await client.post("/meals", mealForm());
    expect(created.status).toBe(303);
    const path = created.headers.get("location")!.split("?")[0]!;

    const page = await (await client.get(path)).text();
    expect(page).toContain("Test bowl");
    expect(page).toContain("Chicken thigh");

    const id = Number(path.split("/").pop());
    const meal = getMeal(t.deps.db, id)!;
    expect(meal.tags).toEqual(["chicken", "quick"]);
    expect(meal.ingredients).toHaveLength(2);
    expect(meal.nutritionStatus).toBe("manual");

    const edit = await client.get(`${path}/edit`);
    expect(await edit.text()).toContain('value="Test bowl"');
    const updated = await client.post(path, mealForm({ name: "Better bowl", protein: "44" }));
    expect(updated.status).toBe(303);
    expect(getMeal(t.deps.db, id)!.name).toBe("Better bowl");
    expect(getMeal(t.deps.db, id)!.proteinG).toBe(44);

    const del = await client.post(`${path}/delete`);
    expect(del.status).toBe(303);
    expect(getMeal(t.deps.db, id)).toBeNull();
  });

  it("is shared: either user can see and edit the other's meals", async () => {
    const t = setup();
    const robin = await signIn(t, ROBIN);
    const sam = await signIn(t, SAM);
    const created = await robin.post("/meals", mealForm());
    const path = created.headers.get("location")!.split("?")[0]!;
    expect((await sam.get(path)).status).toBe(200);
    expect((await sam.post(path, mealForm({ name: "Sam's tweak" }))).status).toBe(303);
    expect(await (await robin.get(path)).text()).toContain("Sam&#39;s tweak");
  });

  it("shows errors and keeps the typed values", async () => {
    const t = setup();
    const client = await signIn(t);
    const res = await client.post("/meals", mealForm({ name: "", servings: "0", ing_name: ["Chickpeas"], ing_qty: ["400"], ing_unit: ["g"], ing_cat: ["pantry"], ing_kcal: [""], ing_protein: [""], ing_fibre: [""] }));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Give the meal a name");
    expect(html).toContain("Servings must be more than 0");
    expect(html).toContain('value="Chickpeas"');
  });

  it("requires sign-in", async () => {
    const t = setup();
    expect((await t.client().get("/meals/new")).status).toBe(302);
    expect((await t.client().post("/meals", mealForm())).status).toBe(401);
  });

  it("returns 404 for a missing meal", async () => {
    const t = setup();
    const client = await signIn(t);
    expect((await client.get("/meals/999")).status).toBe(404);
    expect((await client.get("/meals/abc")).status).toBe(404);
  });
});

describe("nutrition status", () => {
  it("keeps the AI label only while totals are unchanged", () => {
    const base = mealForm({ status_from: "ai_estimate", orig_totals: "450|40|10" });
    const same = parseMealForm(base);
    expect(same.ok && same.value.nutritionStatus).toBe("ai_estimate");
    const changed = parseMealForm({ ...base, protein: "42" });
    expect(changed.ok && changed.value.nutritionStatus).toBe("edited");
  });
});

describe("food CRUD", () => {
  it("creates and edits a food", async () => {
    const t = setup();
    const client = await signIn(t);
    const res = await client.post("/foods", { name: "Kalo yoghurt", unit: "g", default_amount: "100", kcal: "88", protein: "9.3", fibre: "0", category: "dairy", notes: "" });
    expect(res.status).toBe(303);
    const list = await (await client.get("/foods")).text();
    expect(list).toContain("Kalo yoghurt");
    const bad = await client.post("/foods", { name: "", unit: "g", default_amount: "0", kcal: "x", protein: "", fibre: "", category: "dairy", notes: "" });
    expect(bad.status).toBe(400);
  });
});

describe("form helpers", () => {
  it("parses numbers with comma decimals", () => {
    expect(num("12,5")).toBe(12.5);
    expect(num("")).toBeNull();
    expect(Number.isNaN(num("abc"))).toBe(true);
  });
  it("normalises tags", () => {
    expect(parseTags(" High Fibre, quick ,, QUICK")).toEqual(["high fibre", "quick"]);
  });
  it("flags totals that don't match the ingredient lines", () => {
    const lines = [
      { kcal: 600, proteinG: 80, fibreG: 4 },
      { kcal: 300, proteinG: 4, fibreG: 16 },
    ];
    const fromLines = perServeFromLines(lines, 2)!;
    expect(fromLines).toEqual({ kcal: 450, proteinG: 42, fibreG: 10 });
    expect(findMismatches({ kcal: 455, proteinG: 41, fibreG: 10.5 }, fromLines)).toEqual([]);
    expect(findMismatches({ kcal: 650, proteinG: 42, fibreG: 10 }, fromLines).map((m) => m.field)).toEqual(["kcal"]);
  });
});
