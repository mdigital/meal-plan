import type { User } from "../db/schema.js";
import { fmtG, fmtKcal, type Macros } from "../lib/nutrition.js";

type Row = { key: keyof Macros; label: string; target: number; unit: string; kind: "limit" | "goal" };

/**
 * Running totals against the user's targets. kcal is a budget (going over is bad);
 * protein and fibre are goals (reaching them is good).
 */
export function TargetBars(props: { totals: Macros; user: User; compact?: boolean }) {
  const { totals, user } = props;
  const rows: Row[] = [
    { key: "kcal", label: "Energy", target: user.targetKcal, unit: "kcal", kind: "limit" },
    { key: "proteinG", label: "Protein", target: user.targetProteinG, unit: "g", kind: "goal" },
    { key: "fibreG", label: "Fibre", target: user.targetFibreG, unit: "g", kind: "goal" },
  ];
  return (
    <div class={`targets ${props.compact ? "compact" : ""}`}>
      {rows.map((r) => {
        const value = totals[r.key];
        const pct = r.target > 0 ? Math.min(100, (value / r.target) * 100) : 0;
        const diff = r.target - value;
        const fmt = (n: number) => (r.unit === "kcal" ? fmtKcal(n) : fmtG(n));
        let status: string;
        let state: "ok" | "over" | "todo";
        if (r.kind === "limit") {
          state = diff >= 0 ? "ok" : "over";
          status = diff >= 0 ? `${fmt(diff)} ${r.unit} left` : `${fmt(-diff)} ${r.unit} over`;
        } else {
          state = diff <= 0 ? "ok" : "todo";
          status = diff <= 0 ? "Target met" : `${fmt(diff)} ${r.unit} to go`;
        }
        return (
          <div class={`target target-${state}`}>
            <div class="row spread small">
              <span>
                <b>{r.label}</b> {fmt(value)} / {fmt(r.target)} {r.unit}
              </span>
              <span class="target-status">{status}</span>
            </div>
            <div
              class="bar"
              role="progressbar"
              aria-label={`${r.label} against target`}
              aria-valuemin={0}
              aria-valuemax={Math.round(r.target)}
              aria-valuenow={Math.round(value)}
            >
              <span class={`w-${Math.round(pct / 5) * 5}`}></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
