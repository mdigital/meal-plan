import { describe, expect, it } from "vitest";
import { buildShoppingList, isStaple, listToText, mergeKey, shoppingAmount, toBase, type NeedLine } from "../src/lib/shopping.js";
import { CATEGORY_LABELS } from "../src/db/schema.js";

const STAPLES = ["Bay leaves", "Dried herbs", "Spices", "Salt", "Pepper", "Flour", "Sugar", "Butter", "Olive oil"];
const line = (name: string, quantity: number | null, unit: NeedLine["unit"], category: NeedLine["category"] = "pantry"): NeedLine => ({ name, quantity, unit, category });

describe("unit conversion", () => {
  it("converts to base units", () => {
    expect(toBase(1.5, "kg")).toEqual({ dim: "mass", value: 1500 });
    expect(toBase(2, "L")).toEqual({ dim: "volume", value: 2000 });
    expect(toBase(2, "tbsp")).toEqual({ dim: "spoon", value: 6 });
    expect(toBase(3, "whole")).toEqual({ dim: "count", value: 3 });
  });

  it("rounds up to sensible shopping amounts", () => {
    expect(shoppingAmount("mass", 12)).toEqual({ quantity: 15, unit: "g" });
    expect(shoppingAmount("mass", 2)).toEqual({ quantity: 5, unit: "g" });
    expect(shoppingAmount("mass", 420)).toEqual({ quantity: 450, unit: "g" });
    expect(shoppingAmount("mass", 1000)).toEqual({ quantity: 1, unit: "kg" });
    expect(shoppingAmount("mass", 1240)).toEqual({ quantity: 1.3, unit: "kg" });
    expect(shoppingAmount("volume", 1500)).toEqual({ quantity: 1.5, unit: "L" });
    expect(shoppingAmount("volume", 250)).toEqual({ quantity: 250, unit: "ml" });
    expect(shoppingAmount("spoon", 1)).toEqual({ quantity: 1, unit: "tsp" });
    expect(shoppingAmount("spoon", 4)).toEqual({ quantity: 1.5, unit: "tbsp" });
    expect(shoppingAmount("count", 0.5)).toEqual({ quantity: 1, unit: "" });
    expect(shoppingAmount("count", 2.25)).toEqual({ quantity: 3, unit: "" });
  });
});

describe("merging", () => {
  it("normalises names", () => {
    expect(mergeKey("Eggs")).toBe(mergeKey("egg"));
    expect(mergeKey("Tomatoes, chopped")).toBe(mergeKey("tomato"));
    expect(mergeKey("Mixed berries")).toBe(mergeKey("mixed berry"));
    expect(mergeKey("Anchor Protein milk (coffee)")).toBe(mergeKey("Anchor Protein milk"));
    expect(mergeKey("Fresh baby spinach")).toBe(mergeKey("baby spinach"));
    expect(mergeKey("Swiss chard")).toBe("swiss chard");
  });

  it("adds identical ingredients across meals and converts g to kg", () => {
    const out = buildShoppingList(
      [line("Chicken thigh", 600, "g", "meat_fish"), line("chicken thighs", 0.5, "kg", "meat_fish"), line("Kale", 100, "g", "produce")],
      [],
    );
    expect(out).toEqual([
      { name: "Chicken thigh", quantity: 1.1, unit: "kg", category: "meat_fish", isStaple: false },
      { name: "Kale", quantity: 100, unit: "g", category: "produce", isStaple: false },
    ]);
  });

  it("converts ml and L", () => {
    const out = buildShoppingList([line("Anchor Protein milk", 150, "ml", "dairy"), line("Anchor Protein milk (coffee)", 1, "L", "dairy")], []);
    expect(out[0]).toMatchObject({ name: "Anchor Protein milk", quantity: 1.2, unit: "L" });
  });

  it("keeps teaspoons and tablespoons for spices", () => {
    const out = buildShoppingList([line("Ground cumin", 1, "tsp"), line("ground cumin", 1, "tbsp"), line("Sumac", 2, "tsp")], []);
    expect(out).toEqual([
      { name: "Ground cumin", quantity: 1.5, unit: "tbsp", category: "pantry", isStaple: false },
      { name: "Sumac", quantity: 2, unit: "tsp", category: "pantry", isStaple: false },
    ]);
  });

  it("folds spoons into ml when the same item is also in ml", () => {
    const out = buildShoppingList([line("Soy sauce", 2, "tbsp"), line("Soy sauce", 100, "ml")], []);
    expect(out).toEqual([{ name: "Soy sauce", quantity: 150, unit: "ml", category: "pantry", isStaple: false }]);
  });

  it("keeps lines with units that can't be converted separate", () => {
    const out = buildShoppingList([line("Chickpeas", 1, "whole"), line("Chickpeas", 240, "g")], []);
    expect(out.map((o) => `${o.quantity} ${o.unit}`)).toEqual(["1 ", "250 g"]);
  });

  it("rounds whole items up", () => {
    const out = buildShoppingList([line("Avocado", 0.5, "whole", "produce"), line("Avocado", 0.5, "whole", "produce"), line("Lemon", 0.5, "whole", "produce")], []);
    expect(out.map((o) => [o.name, o.quantity])).toEqual([["Avocado", 1], ["Lemon", 1]]);
  });

  it("keeps items with no quantity", () => {
    const out = buildShoppingList([line("Salt", null, "whole"), line("Salt", null, "whole")], []);
    expect(out).toEqual([{ name: "Salt", quantity: null, unit: "", category: "pantry", isStaple: false }]);
  });
});

describe("pantry staples", () => {
  it("matches the seeded staples", () => {
    for (const name of ["Salt", "Sea salt flakes", "Black pepper", "Plain flour", "Brown sugar", "Unsalted butter", "Extra virgin olive oil", "Bay leaves", "Ground cumin", "Smoked paprika", "Dried oregano", "Garam masala"]) {
      expect(isStaple(name, STAPLES), name).toBe(true);
    }
  });

  it("doesn't catch look-alikes", () => {
    for (const name of ["Red pepper", "Peanut butter", "Butter beans", "Sugar snap peas", "Fresh coriander", "Oregano leaves", "Chicken thigh"]) {
      expect(isStaple(name, STAPLES), name).toBe(false);
    }
  });

  it("flags staples on the built list", () => {
    const out = buildShoppingList([line("Olive oil", 1, "tbsp"), line("Kale", 100, "g", "produce")], STAPLES);
    expect(out.map((o) => o.isStaple)).toEqual([true, false]);
  });
});

describe("plain text", () => {
  it("groups by category and skips checked items", () => {
    const text = listToText(
      "Shopping",
      [
        { name: "Kale", quantity: 100, unit: "g", category: "produce" },
        { name: "Lemon", quantity: 2, unit: "", category: "produce" },
        { name: "Feta", quantity: 150, unit: "g", category: "dairy", checked: true },
        { name: "Salt", quantity: null, unit: "", category: "pantry" },
      ],
      CATEGORY_LABELS,
    );
    expect(text).toBe("Shopping\n\nPRODUCE\n- Kale, 100 g\n- 2 × Lemon\n\nPANTRY\n- Salt");
  });
});
