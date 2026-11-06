export type Macros = { kcal: number; proteinG: number; fibreG: number };

export const ZERO: Macros = { kcal: 0, proteinG: 0, fibreG: 0 };

export function addMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, fibreG: a.fibreG + b.fibreG };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return { kcal: m.kcal * factor, proteinG: m.proteinG * factor, fibreG: m.fibreG * factor };
}

type Line = { kcal: number | null; proteinG: number | null; fibreG: number | null };

/** Per-serve totals from per-line (whole recipe) figures. Returns null if no line has nutrition. */
export function perServeFromLines(lines: Line[], servings: number): Macros | null {
  const withData = lines.filter((l) => l.kcal != null || l.proteinG != null || l.fibreG != null);
  if (withData.length === 0 || servings <= 0) return null;
  const sum = withData.reduce<Macros>(
    (acc, l) => addMacros(acc, { kcal: l.kcal ?? 0, proteinG: l.proteinG ?? 0, fibreG: l.fibreG ?? 0 }),
    ZERO,
  );
  return scaleMacros(sum, 1 / servings);
}

export type Mismatch = { field: keyof Macros; label: string; stated: number; fromLines: number };

/**
 * Compares stated per-serve totals with the sum of the ingredient lines.
 * Flags a field when it differs by more than `tolerance` (relative) and an
 * absolute floor, so tiny numbers (0.4 g vs 0.6 g fibre) don't trigger.
 */
export function findMismatches(stated: Macros, fromLines: Macros | null, tolerance = 0.12): Mismatch[] {
  if (!fromLines) return [];
  const floors: Record<keyof Macros, number> = { kcal: 25, proteinG: 3, fibreG: 2 };
  const labels: Record<keyof Macros, string> = { kcal: "kcal", proteinG: "protein", fibreG: "fibre" };
  const out: Mismatch[] = [];
  for (const field of ["kcal", "proteinG", "fibreG"] as const) {
    const a = stated[field];
    const b = fromLines[field];
    const diff = Math.abs(a - b);
    if (diff > floors[field] && diff > tolerance * Math.max(a, b)) {
      out.push({ field, label: labels[field], stated: a, fromLines: b });
    }
  }
  return out;
}

export function fmtKcal(n: number): string {
  return Math.round(n).toLocaleString("en-NZ");
}

export function fmtG(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
