import type { Unit } from "../db/schema.js";

/** Rounds a scaled amount to something you'd actually measure. */
export function roundForUnit(q: number, unit: Unit | string): number {
  if (!Number.isFinite(q)) return q;
  if (unit === "whole" || unit === "tsp" || unit === "tbsp") return Math.max(0.25, Math.round(q * 4) / 4);
  if (unit === "kg" || unit === "L") return Math.round(q * 100) / 100;
  // g and ml
  if (q < 10) return Math.round(q * 10) / 10;
  if (q < 100) return Math.round(q);
  return Math.round(q / 5) * 5;
}

export function scaleQuantity(q: number | null, unit: Unit, factor: number): number | null {
  return q == null ? null : roundForUnit(q * factor, unit);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/**
 * Scales amounts written with a measuring unit in recipe text ("45 ml fish sauce",
 * "1 tbsp miso", "700g chicken"). Temperatures, times and sizes (°C, minutes, cm)
 * are left alone, as are counts of whole items, which read oddly when scaled in prose.
 */
export function scaleMethodText(text: string, factor: number): string {
  if (factor === 1) return text;
  return text.replace(/(\d+(?:[.,]\d+)?)(\s?)(kg|g|ml|L|tsp|tbsp)\b(?!\s*°)/g, (_m, num: string, space: string, unit: string) => {
    const scaled = roundForUnit(Number(num.replace(",", ".")) * factor, unit);
    return `${fmt(scaled)}${space}${unit}`;
  });
}
