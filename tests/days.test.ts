import { describe, expect, it } from "vitest";
import { ROBIN, SAM, setup, signIn } from "./helpers.js";
import { seedIfNeeded } from "../src/seed.js";
import { listMeals, listFoods } from "../src/services/meals.js";
import { getDay, nzToday, formatDate } from "../src/services/days.js";
import { users } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

async function ready() {
  const t = setup();
  seedIfNeeded(t.deps.db);
  const client = await signIn(t);
  const robin = t.deps.db.select().from(users).where(eq(users.email, ROBIN)).get()!;
  const meal = (name: string) => listMeals(t.deps.db).find((m) => m.name === name)!;
  const food = (name: string) => listFoods(t.deps.db).find((f) => f.name === name)!;
  const newDay = async (name = "Monday") => {
    const res = await client.post("/days", { name, date: "2026-11-09" });
    return Number(res.headers.get("location")!.split("/").pop());
  };
  return { t, client, robin, meal, food, newDay };
}

describe("day builder", () => {
  it("builds a day with running totals against targets", async () => {
    const { t, client, robin, meal, food, newDay } = await ready();
    const id = await newDay();
    await client.post(`/days/${id}/entries`, { slot: "breakfast", meal_id: String(meal("Overnight oats").id), amount: "1" });
    await client.post(`/days/${id}/entries`, { slot: "lunch", meal_id: String(meal("Chicken, lentil and kale salad").id), amount: "1" });
    await client.post(`/days/${id}/entries`, { slot: "dinner", meal_id: String(meal("Snapper and white beans").id), amount: "1" });
    await client.post(`/days/${id}/entries`, { slot: "snack", food_id: String(food("Whey protein powder").id), amount: "15" });

    const day = getDay(t.deps.db, robin.id, id)!;
    expect(day.entries).toHaveLength(4);
    // 391 + 468 + 402 + 58.05
    expect(Math.round(day.totals.kcal)).toBe(1319);
    expect(Math.round(day.totals.proteinG)).toBe(132);

    const html = await (await client.get(`/days/${id}`)).text();
    expect(html).toContain("181 kcal left");
    expect(html).toContain("Target met"); // protein 132 of 120
    expect(html).toContain("<b>Fibre</b> 33.5 / 28 g");
  });

  it("shows protein still to go", async () => {
    const { client, meal, newDay } = await ready();
    const id = await newDay();
    await client.post(`/days/${id}/entries`, { slot: "dinner", meal_id: String(meal("Snapper and white beans").id), amount: "1" });
    const html = await (await client.get(`/days/${id}`)).text();
    expect(html).toContain("72 g to go");
    expect(html).toContain("14 g to go");
  });

  it("scales entries by servings and shows kcal over budget", async () => {
    const { t, client, robin, meal, newDay } = await ready();
    const id = await newDay();
    await client.post(`/days/${id}/entries`, { slot: "dinner", meal_id: String(meal("Tandoori chicken and dal").id), amount: "1" });
    const entry = getDay(t.deps.db, robin.id, id)!.entries[0]!;
    // Quick button 1.5 wins over the number input value.
    await client.post(`/days/${id}/entries/${entry.id}`, { amount: ["1", "1.5"] });
    expect(getDay(t.deps.db, robin.id, id)!.totals.kcal).toBe(717);
    await client.post(`/days/${id}/entries/${entry.id}`, { amount: "4" });
    const html = await (await client.get(`/days/${id}`)).text();
    expect(html).toContain("412 kcal over"); // 1912 - 1500
    await client.post(`/days/${id}/entries/${entry.id}`, { amount: "-2" });
    expect(getDay(t.deps.db, robin.id, id)!.entries[0]!.amount).toBe(4); // invalid ignored
  });

  it("removes entries", async () => {
    const { t, client, robin, meal, newDay } = await ready();
    const id = await newDay();
    await client.post(`/days/${id}/entries`, { slot: "dinner", meal_id: String(meal("Vietnamese chicken salad").id), amount: "1" });
    const entry = getDay(t.deps.db, robin.id, id)!.entries[0]!;
    await client.post(`/days/${id}/entries/${entry.id}/delete`);
    expect(getDay(t.deps.db, robin.id, id)!.entries).toHaveLength(0);
  });

  it("saves a name and duplicates a day", async () => {
    const { t, client, robin, meal, newDay } = await ready();
    const id = await newDay();
    await client.post(`/days/${id}/entries`, { slot: "dinner", meal_id: String(meal("Snapper and white beans").id), amount: "2" });
    await client.post(`/days/${id}`, { name: "Training day", date: "2026-11-10" });
    expect(getDay(t.deps.db, robin.id, id)!.name).toBe("Training day");
    const dup = await client.post(`/days/${id}/duplicate`);
    const copyId = Number(dup.headers.get("location")!.split("/").pop());
    const copy = getDay(t.deps.db, robin.id, copyId)!;
    expect(copy.name).toBe("Training day (copy)");
    expect(copy.entries.map((e) => [e.slot, e.amount])).toEqual([["dinner", 2]]);
    expect((await client.get("/days")).status).toBe(200);
  });

  it("adds a meal from its page to a new or existing day", async () => {
    const { t, client, robin, meal } = await ready();
    const m = meal("Miso salmon with greens and edamame");
    const page = await (await client.get(`/days/add?meal=${m.id}`)).text();
    expect(page).toContain("Which day?");
    const res = await client.post("/days/add", { meal_id: String(m.id), day_id: "new", slot: "dinner", amount: "1" });
    expect(res.status).toBe(303);
    const id = Number(res.headers.get("location")!.split("/").pop()!.split("#")[0]);
    const day = getDay(t.deps.db, robin.id, id)!;
    expect(day.date).toBe(nzToday(t.deps.now()));
    expect(day.name).toBe(formatDate(day.date!));
    expect(day.bySlot.dinner[0]!.name).toBe(m.name);
  });

  it("keeps days private to each user", async () => {
    const { t, newDay } = await ready();
    const id = await newDay();
    const sam = await signIn(t, SAM);
    expect((await sam.get(`/days/${id}`)).status).toBe(404);
    expect((await sam.post(`/days/${id}/delete`)).status).toBe(404);
    expect(await (await sam.get("/days")).text()).toContain("No days yet");
  });

  it("lists slot meals and foods in the picker", async () => {
    const { client, newDay } = await ready();
    const id = await newDay();
    const html = await (await client.get(`/days/${id}/add?slot=breakfast`)).text();
    expect(html).toContain("Overnight oats");
    expect(html).not.toContain("Snapper and white beans");
    expect(html).toContain("Kalo Greek yoghurt");
    const all = await (await client.get(`/days/${id}/add?slot=breakfast&all=1`)).text();
    expect(all).toContain("Snapper and white beans");
  });

  it("updates daily targets in settings", async () => {
    const { t, client, robin } = await ready();
    expect(robin.targetKcal).toBe(1500);
    expect(robin.targetProteinG).toBe(120);
    expect(robin.targetFibreG).toBe(28);
    expect((await client.post("/settings/targets", { kcal: "1800", protein: "130", fibre: "30" })).status).toBe(303);
    const after = t.deps.db.select().from(users).where(eq(users.id, robin.id)).get()!;
    expect([after.targetKcal, after.targetProteinG, after.targetFibreG]).toEqual([1800, 130, 30]);
    expect((await client.post("/settings/targets", { kcal: "abc", protein: "130", fibre: "30" })).status).toBe(400);
  });
});
