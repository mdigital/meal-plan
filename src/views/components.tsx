import type { Meal } from "../db/schema.js";
import { SLOT_LABELS } from "../db/schema.js";
import { fmtG, fmtKcal, type Macros } from "../lib/nutrition.js";

export function MacroLine(props: { m: Macros; class?: string }) {
  return (
    <div class={`macros ${props.class ?? ""}`}>
      <span>
        <b>{fmtKcal(props.m.kcal)}</b> kcal
      </span>
      <span>
        <b>{fmtG(props.m.proteinG)}</b> g protein
      </span>
      <span>
        <b>{fmtG(props.m.fibreG)}</b> g fibre
      </span>
    </div>
  );
}

export function StatusBadge(props: { status: Meal["nutritionStatus"] }) {
  if (props.status === "manual") return null;
  return (
    <span class="pill" title="Nutrition is approximate">
      {props.status === "ai_estimate" ? "AI estimate" : "Edited estimate"}
    </span>
  );
}

export function MealCard(props: { meal: Meal }) {
  const m = props.meal;
  return (
    <a class="card card-link meal-card" href={`/meals/${m.id}`}>
      <div class="row spread">
        <h3>{m.name}</h3>
      </div>
      <div class="row small">
        <span class="pill">{SLOT_LABELS[m.slot]}</span>
        {m.tags.slice(0, 3).map((t) => (
          <span class="pill">{t}</span>
        ))}
      </div>
      <MacroLine m={m} class="small" />
    </a>
  );
}

export function Errors(props: { errors?: string[] }) {
  if (!props.errors?.length) return null;
  return (
    <div class="flash error" role="alert">
      <b>Please fix:</b>
      <ul>
        {props.errors.map((e) => (
          <li>{e}</li>
        ))}
      </ul>
    </div>
  );
}

export function Flash(props: { message?: string | null }) {
  if (!props.message) return null;
  return (
    <div class="flash" role="status">
      {props.message}
    </div>
  );
}
