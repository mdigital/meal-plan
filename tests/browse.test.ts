import { describe, expect, it } from "vitest";
import { setup, signIn } from "./helpers.js";
import { seedIfNeeded } from "../src/seed.js";
import { listMeals } from "../src/services/meals.js";

function cardNames(html: string): string[] {
  return [...html.matchAll(/class="card card-link meal-card"[^>]*>.*?<h3>(.*?)<\/h3>/gs)].map((m) => m[1]!.replace(/&#39;/g, "'"));
}

describe("browse", () => {
  async function seeded() {
    const t = setup();
    seedIfNeeded(t.deps.db);
    return { t, client: await signIn(t) };
  }

  it("finds the highest-protein dinner in two taps", async () => {
    const { client } = await seeded();
    const home = await (await client.get("/meals")).text();
    // Tap 1: the Dinner chip.
    const dinnerHref = home.match(/href="([^"]*slot=dinner[^"]*)"/)![1]!.replace(/&amp;/g, "&");
    const dinners = await (await client.get(dinnerHref)).text();
    // Tap 2: "Most protein".
    const proteinHref = dinners.match(/href="([^"]*sort=protein[^"]*)"/)![1]!.replace(/&amp;/g, "&");
    expect(proteinHref).toContain("slot=dinner");
    const sorted = cardNames(await (await client.get(proteinHref)).text());
    expect(sorted[0]).toBe("Tandoori chicken and dal");
    expect(sorted).toHaveLength(11);
  });

  it("filters by tag", async () => {
    const { client } = await seeded();
    const names = cardNames(await (await client.get("/meals?tag=vegetarian")).text());
    expect(names.sort()).toEqual(["Avocado toast", "Crispy miso tofu with sesame greens", "Halloumi, white beans and roasted veg"]);
  });

  it("searches names, tags and ingredients", async () => {
    const { client } = await seeded();
    expect(cardNames(await (await client.get("/meals?q=salmon")).text())).toEqual(["Miso salmon with greens and edamame"]);
    expect(cardNames(await (await client.get("/meals?q=chia")).text())).toEqual(["Overnight oats"]);
    expect(cardNames(await (await client.get("/meals?q=%25")).text())).toEqual([]);
  });

  it("sorts by fibre and kcal", () => {
    const t = setup();
    seedIfNeeded(t.deps.db);
    expect(listMeals(t.deps.db, { sort: "fibre", slot: "dinner" })[0]!.name).toBe("Snapper and white beans");
    expect(listMeals(t.deps.db, { sort: "kcal" })[0]!.name).toBe("Whey in water");
  });

  it("ignores bad filter values", async () => {
    const { client } = await seeded();
    const res = await client.get("/meals?slot=brunch&sort=evil");
    expect(res.status).toBe(200);
    expect(cardNames(await res.text()).length).toBe(17);
  });
});
