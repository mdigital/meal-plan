import { CATEGORIES, CATEGORY_LABELS, SLOTS, SLOT_LABELS, UNITS } from "../db/schema.js";
import type { IngredientInput, MealInput } from "../services/meals.js";
import { findMismatches, fmtG, fmtKcal, perServeFromLines } from "../lib/nutrition.js";
import { Csrf } from "./layout.js";
import { Errors } from "./components.js";

const blankIngredient: IngredientInput = {
  name: "",
  quantity: null,
  unit: "g",
  category: "produce",
  kcal: null,
  proteinG: null,
  fibreG: null,
};

const v = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n * 10) / 10));

function IngredientRow(props: { ing: IngredientInput; index: number }) {
  const { ing, index } = props;
  const n = index + 1;
  return (
    <fieldset class="ing-row card">
      <legend class="sr-only">Ingredient {n}</legend>
      <div class="ing-main">
        <label class="ef">
          <span class="eyebrow">Ingredient</span>
          <input name="ing_name" value={ing.name} />
        </label>
        <label class="ef">
          <span class="eyebrow">Qty</span>
          <input name="ing_qty" inputmode="decimal" value={v(ing.quantity)} />
        </label>
        <label class="ef">
          <span class="eyebrow">Unit</span>
          <select name="ing_unit">
            {UNITS.map((u) => (
              <option value={u} selected={u === ing.unit}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <button type="button" class="secondary small ing-remove" data-remove-row aria-label={`Remove ingredient ${n}`}>
          ✕
        </button>
      </div>
      <div class="ing-extra">
        <label class="ef">
          <span class="eyebrow">Category</span>
          <select name="ing_cat">
            {CATEGORIES.map((c) => (
              <option value={c} selected={c === ing.category}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label class="ef">
          <span class="eyebrow">kcal</span>
          <input name="ing_kcal" inputmode="decimal" value={v(ing.kcal)} />
        </label>
        <label class="ef">
          <span class="eyebrow">Protein g</span>
          <input name="ing_protein" inputmode="decimal" value={v(ing.proteinG)} />
        </label>
        <label class="ef">
          <span class="eyebrow">Fibre g</span>
          <input name="ing_fibre" inputmode="decimal" value={v(ing.fibreG)} />
        </label>
      </div>
    </fieldset>
  );
}

export type MealFormProps = {
  action: string;
  csrf: string;
  meal: MealInput;
  errors?: string[];
  /** Where the numbers came from, used to keep or downgrade the AI label. */
  statusFrom: MealInput["nutritionStatus"];
  submitLabel: string;
  cancelHref: string;
};

export function MealForm(props: MealFormProps) {
  const m = props.meal;
  const ingredients = m.ingredients.length ? m.ingredients : [blankIngredient, blankIngredient, blankIngredient];
  const fromLines = perServeFromLines(m.ingredients, m.servingsInRecipe);
  const mismatches = findMismatches(m, fromLines);
  const isEstimate = props.statusFrom !== "manual";

  return (
    <form method="post" action={props.action} class="stack meal-form" data-meal-form>
      <Csrf token={props.csrf} />
      <input type="hidden" name="status_from" value={props.statusFrom} />
      <input type="hidden" name="orig_totals" value={`${m.kcal}|${m.proteinG}|${m.fibreG}`} />
      <Errors errors={props.errors} />

      <div class="field">
        <label for="name">Name</label>
        <input id="name" name="name" required value={m.name} />
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="slot">Slot</label>
          <select id="slot" name="slot">
            {SLOTS.map((s) => (
              <option value={s} selected={s === m.slot}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="servings">Serves</label>
          <input id="servings" name="servings" inputmode="decimal" required value={v(m.servingsInRecipe)} />
        </div>
      </div>
      <div class="field">
        <label for="tags">Tags</label>
        <input id="tags" name="tags" placeholder="e.g. quick, chicken, high fibre" value={m.tags.join(", ")} />
        <p class="small muted">Separate with commas.</p>
      </div>

      <h2>Nutrition per serve</h2>
      {isEstimate ? (
        <div class="notice small">
          These numbers are an <b>estimate</b>. Check them and change anything that looks wrong.
        </div>
      ) : null}
      {mismatches.length ? (
        <div class="notice small" role="alert" data-mismatch>
          <b>Check these totals:</b> the ingredient lines add up to{" "}
          {mismatches
            .map((x) => `${x.field === "kcal" ? fmtKcal(x.fromLines) : fmtG(x.fromLines)}${x.field === "kcal" ? " kcal" : ` g ${x.label}`}`)
            .join(", ")}{" "}
          per serve, which doesn't match the totals below.
        </div>
      ) : null}
      {m.assumptions.length ? (
        <details class="card small" open>
          <summary>Assumptions made by the estimate</summary>
          <ul>
            {m.assumptions.map((a) => (
              <li>
                {a}
                <input type="hidden" name="assumption" value={a} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div class="grid-3">
        <div class="field">
          <label for="kcal">kcal</label>
          <input id="kcal" name="kcal" inputmode="decimal" value={v(m.kcal)} />
        </div>
        <div class="field">
          <label for="protein">Protein g</label>
          <input id="protein" name="protein" inputmode="decimal" value={v(m.proteinG)} />
        </div>
        <div class="field">
          <label for="fibre">Fibre g</label>
          <input id="fibre" name="fibre" inputmode="decimal" value={v(m.fibreG)} />
        </div>
      </div>
      <p>
        <button type="button" class="secondary small" data-calc-totals>
          Calculate from ingredients
        </button>
        <span class="small muted" data-calc-result aria-live="polite"></span>
      </p>

      <h2>Ingredients</h2>
      <p class="small muted">Quantities and nutrition are for the whole recipe. Nutrition per line is optional.</p>
      <div class="stack" data-ing-list>
        {ingredients.map((ing, i) => (
          <IngredientRow ing={ing} index={i} />
        ))}
      </div>
      <template data-ing-template>
        <IngredientRow ing={blankIngredient} index={98} />
      </template>
      <p>
        <button type="button" class="secondary small" data-add-row>
          + Add ingredient
        </button>
      </p>

      <div class="field">
        <label for="method">Method</label>
        <textarea id="method" name="method">{m.method}</textarea>
      </div>
      <div class="field">
        <label for="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} class="short">{m.notes}</textarea>
      </div>
      <details>
        <summary>Original recipe text</summary>
        <div class="field">
          <label for="source" class="sr-only">Original recipe text</label>
          <textarea id="source" name="source">{m.source}</textarea>
        </div>
      </details>

      <div class="row sticky-actions">
        <button type="submit" data-busy="Saving…">{props.submitLabel}</button>
        <a class="btn secondary" href={props.cancelHref}>
          Cancel
        </a>
      </div>
    </form>
  );
}
