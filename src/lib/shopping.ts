import { CATEGORIES, type Category, type Unit } from "../db/schema.js";

/** One ingredient line already scaled to what needs buying. */
export type NeedLine = { name: string; quantity: number | null; unit: Unit; category: Category };

export type ShoppingLine = {
  name: string;
  quantity: number | null;
  unit: string; // display unit: g, kg, ml, L, tsp, tbsp, or "" for whole items
  category: Category;
  isStaple: boolean;
};

type Dimension = "mass" | "volume" | "spoon" | "count";

const BASE: Record<Unit, { dim: Dimension; factor: number }> = {
  g: { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  ml: { dim: "volume", factor: 1 },
  L: { dim: "volume", factor: 1000 },
  tsp: { dim: "spoon", factor: 1 },
  tbsp: { dim: "spoon", factor: 3 },
  whole: { dim: "count", factor: 1 },
};
const TSP_ML = 5;

/** Converts a quantity to its base unit (g, ml, tsp or count). */
export function toBase(quantity: number, unit: Unit): { dim: Dimension; value: number } {
  const b = BASE[unit];
  return { dim: b.dim, value: quantity * b.factor };
}

/** Name used to decide whether two ingredient lines are the same thing. */
export function mergeKey(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[,;].*$/, " ") // "Chickpeas, drained" -> "chickpeas"
    .replace(/\b(fresh|large|small|medium|chopped|sliced|diced|finely|roughly|minced|grated|crushed)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Simple plurals: "eggs" -> "egg", "tomatoes" -> "tomato", "berries" -> "berry". Leave "ss" words.
  s = s
    .split(" ")
    .map((w) => {
      if (w.length <= 3 || w.endsWith("ss")) return w;
      if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
      if (w.endsWith("oes")) return w.slice(0, -2);
      if (w.endsWith("s")) return w.slice(0, -1);
      return w;
    })
    .join(" ");
  return s;
}

/** Display name: first-seen name without parenthetical notes. */
function displayName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim() || name.trim();
}

const roundUpTo = (n: number, step: number) => Math.ceil(n / step - 1e-9) * step;
const tidy = (n: number) => Math.round(n * 100) / 100;

/** Rounds a base quantity up to a sensible amount to buy, picking the display unit. */
export function shoppingAmount(dim: Dimension, value: number): { quantity: number; unit: string } {
  switch (dim) {
    case "mass":
    case "volume": {
      const [small, big] = dim === "mass" ? ["g", "kg"] : ["ml", "L"];
      if (value >= 1000) return { quantity: tidy(roundUpTo(value / 1000, 0.1)), unit: big! };
      if (value >= 100) return { quantity: roundUpTo(value, 50), unit: small! };
      return { quantity: Math.max(5, roundUpTo(value, 5)), unit: small! };
    }
    case "spoon":
      if (value >= 3) return { quantity: tidy(roundUpTo(value / 3, 0.5)), unit: "tbsp" };
      return { quantity: tidy(roundUpTo(value, 0.5)), unit: "tsp" };
    case "count":
      return { quantity: Math.max(1, Math.ceil(value - 1e-9)), unit: "" };
  }
}

// Words that make an ingredient count as "dried herbs and spices".
const SPICE_WORDS = [
  "cumin", "paprika", "smoked paprika", "turmeric", "cinnamon", "nutmeg", "cardamom", "clove", "allspice", "chilli flake",
  "chili flake", "chilli powder", "chili powder", "cayenne", "garam masala", "curry powder", "sumac", "za atar", "zaatar",
  "coriander seed", "fennel seed", "cumin seed", "mustard seed", "nigella seed", "five spice", "ras el hanout", "dukkah",
  "dried oregano", "dried thyme", "dried basil", "dried rosemary", "dried mint", "dried parsley", "dried dill", "mixed herb",
  "italian herb", "ground ginger", "ground coriander", "star anise", "fenugreek", "black pepper", "white pepper", "peppercorn",
];

/** True if an ingredient is covered by one of the user's pantry staples. */
export function isStaple(name: string, staples: string[]): boolean {
  const key = ` ${mergeKey(name)} `;
  for (const raw of staples) {
    const staple = mergeKey(raw);
    if (!staple) continue;
    if (staple.includes("spice") || staple.includes("dried herb")) {
      if (SPICE_WORDS.some((w) => key.includes(` ${mergeKey(w)}`))) return true;
      if (staple.includes("dried herb") && /\bdried\b/.test(key) && /\b(oregano|thyme|basil|rosemary|mint|parsley|dill|sage|tarragon|herb)/.test(key)) return true;
      continue;
    }
    // Whole-word match, so "pepper" matches "black pepper" but not "red capsicum (pepper)"-style partial words.
    if (key.includes(` ${staple} `) || key.startsWith(` ${staple}`)) {
      // "pepper" should not catch fresh peppers/capsicums or chilli peppers.
      if (staple === "pepper" && /\b(bell|red|green|yellow|capsicum|chilli|chili|jalapeno)\b/.test(key)) continue;
      // "butter" should not catch peanut butter or butter beans.
      if (staple === "butter" && /\b(peanut|nut|almond|butter bean|bean)\b/.test(key)) continue;
      // "sugar" should not catch sugar snap peas.
      if (staple === "sugar" && /\bsnap\b/.test(key)) continue;
      return true;
    }
  }
  return false;
}

/**
 * Merges scaled ingredient lines into a shopping list. Lines with the same name
 * are added together when their units can be converted (g/kg, ml/L, tsp/tbsp).
 * Spoons are kept for small amounts but folded into ml when the same item is
 * also measured in ml.
 */
export function buildShoppingList(lines: NeedLine[], staples: string[]): ShoppingLine[] {
  type Acc = { name: string; category: Category; dims: Map<Dimension, number>; noQty: boolean; order: number };
  const byKey = new Map<string, Acc>();
  let order = 0;
  for (const line of lines) {
    const key = mergeKey(line.name);
    if (!key) continue;
    let acc = byKey.get(key);
    if (!acc) {
      acc = { name: displayName(line.name), category: line.category, dims: new Map(), noQty: false, order: order++ };
      byKey.set(key, acc);
    }
    if (line.quantity == null || !(line.quantity > 0)) {
      acc.noQty = true;
      continue;
    }
    const { dim, value } = toBase(line.quantity, line.unit);
    acc.dims.set(dim, (acc.dims.get(dim) ?? 0) + value);
  }

  const out: ShoppingLine[] = [];
  for (const acc of [...byKey.values()].sort((a, b) => a.order - b.order)) {
    const dims = new Map(acc.dims);
    if (dims.has("spoon") && dims.has("volume")) {
      dims.set("volume", dims.get("volume")! + dims.get("spoon")! * TSP_ML);
      dims.delete("spoon");
    }
    const staple = isStaple(acc.name, staples);
    if (dims.size === 0) {
      out.push({ name: acc.name, quantity: null, unit: "", category: acc.category, isStaple: staple });
      continue;
    }
    for (const [dim, value] of dims) {
      const amt = shoppingAmount(dim, value);
      out.push({ name: acc.name, quantity: amt.quantity, unit: amt.unit, category: acc.category, isStaple: staple });
    }
  }
  return out;
}

export function formatQuantity(quantity: number | null, unit: string): string {
  if (quantity == null) return "";
  const q = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 10) / 10);
  return unit ? `${q} ${unit}` : `${q} ×`;
}

/** Plain text for copying or sharing, grouped by category. */
export function listToText(
  title: string,
  items: { name: string; quantity: number | null; unit: string; category: Category; checked?: boolean }[],
  labels: Record<Category, string>,
): string {
  const parts = [title];
  for (const cat of CATEGORIES) {
    const inCat = items.filter((i) => i.category === cat && !i.checked);
    if (!inCat.length) continue;
    parts.push("", labels[cat].toUpperCase());
    for (const i of inCat) {
      const q = formatQuantity(i.quantity, i.unit);
      parts.push(`- ${q ? (i.unit ? `${i.name}, ${q}` : `${q.replace(" ×", "")} × ${i.name}`) : i.name}`);
    }
  }
  return parts.join("\n");
}
