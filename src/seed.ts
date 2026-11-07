import { eq, sql } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { appMeta, foods, mealIngredients, meals, type Slot } from "./db/schema.js";
import { createFood, createMeal, updateMeal, type FoodInput, type IngredientInput, type MealInput } from "./services/meals.js";

type SeedMeal = {
  name: string;
  slot: Slot;
  /** Per serve. */
  kcal: number;
  proteinG: number;
  fibreG: number;
  servings: number;
  tags: string[];
  ingredients: IngredientInput[];
  method: string;
  /** The recipe as written in the planning chat, kept so it can be re-estimated with AI. */
  source: string;
  notes?: string;
};

/** Ingredient line; n = [kcal, protein g, fibre g] for the line, whole recipe, when known. */
const i = (
  name: string,
  quantity: number | null,
  unit: IngredientInput["unit"],
  category: IngredientInput["category"],
  n?: [number, number, number],
): IngredientInput => ({ name, quantity, unit, category, kcal: n?.[0] ?? null, proteinG: n?.[1] ?? null, fibreG: n?.[2] ?? null });

const steps = (...s: string[]) => s.map((t, k) => `${k + 1}. ${t}`).join("\n");

const COFFEE = "Includes a coffee made with 100 ml Anchor Protein milk.";
export const ESTIMATE_NOTE = "Figures are estimates from the planning chat.";

export const SEED_MEALS: SeedMeal[] = [
  // ---------- Breakfasts (each with a coffee) ----------
  {
    name: "Overnight oats",
    slot: "breakfast",
    kcal: 391, proteinG: 26, fibreG: 8.5, servings: 1,
    tags: ["oats", "make ahead"],
    notes: COFFEE,
    ingredients: [
      i("Rolled oats", 40, "g", "pantry", [148, 5, 4]),
      i("Chia seeds", 12, "g", "pantry", [58, 2, 4]),
      i("Kalo Greek yoghurt", 50, "g", "dairy", [45, 4, 0]),
      i("Anchor Protein milk", 150, "ml", "dairy", [83, 9, 0]),
      i("Ground cinnamon, a pinch", 0.25, "tsp", "pantry", [2, 0, 0.5]),
      i("Anchor Protein milk (coffee)", 100, "ml", "dairy", [55, 6, 0]),
    ],
    method: steps(
      "Stir the oats, chia, yoghurt, 150 ml Anchor Protein milk and cinnamon together in a jar.",
      "Cover and refrigerate overnight.",
      "Have with a coffee made with 100 ml Anchor Protein milk.",
    ),
    source: "Overnight oats and coffee: rolled oats 40 g, chia seeds 12 g, Kalo yoghurt 50 g, Anchor Protein milk 150 ml, a pinch of cinnamon, plus Anchor Protein milk 100 ml in a coffee.",
  },
  {
    name: "Egg sandwich",
    slot: "breakfast",
    kcal: 395, proteinG: 26, fibreG: 5, servings: 1,
    tags: ["eggs", "quick"],
    notes: COFFEE,
    ingredients: [
      i("Vogel's Original bread, slices", 2, "whole", "bakery", [200, 8, 5]),
      i("Eggs", 2, "whole", "dairy", [140, 12, 0]),
      i("Anchor Protein milk (coffee)", 100, "ml", "dairy", [55, 6, 0]),
    ],
    method: steps(
      "Poach the eggs, or cook them in a non-stick pan with a spray of oil.",
      "Sandwich between 2 slices of Vogel's Original. Skip the butter: a teaspoon adds 35 to 40 kcal.",
      "Have with a coffee made with 100 ml Anchor Protein milk.",
    ),
    source: "Two-egg sandwich: 2 slices Vogel's Original with 2 eggs, plus a coffee with 100 ml Anchor Protein milk.",
  },
  {
    name: "Avocado toast",
    slot: "breakfast",
    kcal: 375, proteinG: 15.5, fibreG: 10, servings: 1,
    tags: ["quick", "vegetarian"],
    notes: `${COFFEE} Lowest-protein breakfast: pair it with a higher-protein dinner. On avocado-toast days you can skip the avocado in the lunch salad.`,
    ingredients: [
      i("Vogel's Original bread, slices", 2, "whole", "bakery", [200, 8, 5]),
      i("Avocado", 0.5, "whole", "produce", [120, 1.5, 5]),
      i("Anchor Protein milk (coffee)", 100, "ml", "dairy", [55, 6, 0]),
    ],
    method: steps("Toast 2 slices of Vogel's Original.", "Mash half an avocado over the top and season.", "Have with a coffee made with 100 ml Anchor Protein milk."),
    source: "Avocado toast: 2 slices Vogel's Original with half an avocado, plus a coffee with 100 ml Anchor Protein milk.",
  },

  // ---------- Morning tea, lunch, after dinner ----------
  {
    name: "Whey in water",
    slot: "morning_tea",
    kcal: 58, proteinG: 12, fibreG: 0, servings: 1,
    tags: ["quick"],
    notes: "Half a scoop. Check your tub's label: scoops vary.",
    ingredients: [i("Whey protein powder", 15, "g", "pantry", [58, 12, 0])],
    method: steps("Shake 15 g whey with about 200 ml water."),
    source: "Morning tea: 15 g whey in water.",
  },
  {
    name: "Chicken, lentil and kale salad",
    slot: "lunch",
    kcal: 468, proteinG: 46, fibreG: 11, servings: 1,
    tags: ["chicken", "lentils", "kale", "salad"],
    notes: "No olive oil. Loosen the tahini with lemon juice and a splash of water so it stays creamy.",
    ingredients: [
      i("Kale", 60, "g", "produce", [30, 3, 2]),
      i("Chicken breast (cooked weight)", 100, "g", "meat_fish", [165, 31, 0]),
      i("Lentils, tinned (drained)", 80, "g", "pantry", [80, 6, 3]),
      i("Radish", 40, "g", "produce", [6, 0, 1]),
      i("Cucumber", 80, "g", "produce", [12, 1, 0.5]),
      i("Avocado", 50, "g", "produce", [80, 1, 3.5]),
      i("Pumpkin seeds", 10, "g", "pantry", [56, 3, 0.5]),
      i("Tahini", 1, "tsp", "pantry", [36, 1, 0.5]),
      i("Lemon (juice)", 0.5, "whole", "produce", [3, 0, 0]),
    ],
    method: steps(
      "Strip and finely shred the kale, then massage it with a squeeze of lemon.",
      "Slice the radish and cucumber, dice the avocado and slice the cooked chicken.",
      "Whisk the tahini with lemon juice and a splash of water until pourable.",
      "Toss everything with the drained lentils and dressing, and scatter over the pumpkin seeds.",
    ),
    source: "Chicken, lentil and kale salad: kale 60 g, chicken breast 100 g cooked, canned lentils 80 g drained, radish 40 g, cucumber 80 g, avocado 50 g, pumpkin seeds 10 g, tahini 1 tsp, lemon juice. No olive oil.",
  },
  {
    name: "Kalo yoghurt with berries",
    slot: "snack",
    kcal: 123, proteinG: 10, fibreG: 3, servings: 1,
    tags: ["after dinner", "quick", "yoghurt"],
    notes: "Skip on beer nights.",
    ingredients: [i("Kalo Greek yoghurt", 100, "g", "dairy", [90, 9, 0]), i("Mixed berries, frozen", 75, "g", "frozen", [33, 1, 3])],
    method: steps("Spoon 100 g Kalo yoghurt into a bowl and top with 75 g berries."),
    source: "After dinner: 100 g Kalo yoghurt with 75 g frozen berries.",
  },

  // ---------- Dinners: no-rice bowls (each makes 4 serves) ----------
  {
    name: "Chicken, mushroom and broccolini bowl",
    slot: "dinner",
    kcal: 445, proteinG: 42, fibreG: 12, servings: 4,
    tags: ["chicken", "batch cook", "no rice"],
    notes: "Reheats well. Browning the mushrooms hard gives enough savouriness that you won't miss rice.",
    ingredients: [
      i("Chicken thigh, skinless", 700, "g", "meat_fish"),
      i("Mushrooms, shiitake or button", 400, "g", "produce"),
      i("Broccolini", 400, "g", "produce"),
      i("Edamame, shelled", 250, "g", "frozen"),
      i("Garlic cloves", 3, "whole", "produce"),
      i("Ginger, grated", 1, "tbsp", "produce"),
      i("Soy sauce", 45, "ml", "pantry"),
      i("Mirin", 1, "tbsp", "pantry"),
      i("Sesame oil", 2, "tsp", "pantry"),
      i("Spring onions", 2, "whole", "produce"),
      i("Sesame seeds", 1, "tbsp", "pantry"),
    ],
    method: steps(
      "Slice the chicken and brown it hard in a hot pan, then set aside.",
      "Cook the sliced mushrooms in the same pan, without crowding, until deeply golden.",
      "Add the broccolini and edamame with a splash of water, then the crushed garlic and grated ginger.",
      "Return the chicken with the soy sauce, mirin and sesame oil, and toss until glossy.",
      "Finish with sliced spring onion and sesame seeds.",
    ),
    source:
      "Chicken, mushroom and broccolini bowl (4 serves). Slice 700 g skinless chicken thigh and brown it hard in a hot pan, then set aside. Cook 400 g sliced shiitake or button mushrooms in the same pan without crowding until deeply golden. Add 400 g broccolini and 250 g shelled edamame with a splash of water, then 3 crushed garlic cloves and 1 tbsp grated ginger. Return the chicken with 45 ml soy sauce, 1 tbsp mirin and 2 tsp sesame oil, and toss until glossy. Finish with sliced spring onion and 1 tbsp sesame seeds.",
  },
  {
    name: "Kimchi, corn and bacon on cauliflower, with an egg",
    slot: "dinner",
    kcal: 420, proteinG: 32, fibreG: 8, servings: 4,
    tags: ["kimchi", "eggs", "batch cook", "no rice"],
    notes: "Lightest on protein of the dinners. A second egg adds about 70 kcal and 6 g protein.",
    ingredients: [
      i("Bacon, chopped", 120, "g", "meat_fish"),
      i("Corn kernels", 300, "g", "frozen"),
      i("Riced cauliflower", 700, "g", "produce"),
      i("Kimchi, chopped (plus 1 tbsp juice)", 200, "g", "other"),
      i("Eggs", 4, "whole", "dairy"),
      i("Spring onions", 2, "whole", "produce"),
      i("Sesame seeds", 1, "tsp", "pantry"),
    ],
    method: steps(
      "Fry the bacon until crisp and lift it out.",
      "In the bacon fat, char the corn (frozen is fine) in a very hot pan, undisturbed, until blackened in spots.",
      "Add the riced cauliflower and cook for 4 minutes so it stays toothy.",
      "Stir in the kimchi and a tablespoon of its juice, then the bacon.",
      "Top each serve with a fried egg, spring onion and sesame seeds.",
    ),
    source:
      "Kimchi, charred corn and bacon, on cauliflower (4 serves). Fry 120 g chopped bacon until crisp and lift it out. In the bacon fat, char 300 g corn kernels (frozen is fine, cooked undisturbed in a very hot pan) until blackened in spots. Add 700 g riced cauliflower and cook for 4 minutes so it stays toothy. Stir in 200 g chopped kimchi and 1 tbsp of its juice, then the bacon. Top each serve with a fried egg. Add spring onion and sesame seeds.",
  },
  {
    name: "Vietnamese chicken salad",
    slot: "dinner",
    kcal: 430, proteinG: 40, fibreG: 7, servings: 4,
    tags: ["chicken", "salad", "batch cook", "no rice"],
    ingredients: [
      i("Chicken thigh, skinless", 700, "g", "meat_fish"),
      i("Fish sauce", 60, "ml", "pantry"),
      i("Brown sugar", 2, "tsp", "pantry"),
      i("Lemongrass stalks", 2, "whole", "produce"),
      i("Garlic cloves", 3, "whole", "produce"),
      i("Neutral oil", 1, "tbsp", "pantry"),
      i("Cabbage, finely shredded", 400, "g", "produce"),
      i("Cucumbers", 2, "whole", "produce"),
      i("Carrots", 2, "whole", "produce"),
      i("Mint, a big handful", 1, "whole", "produce"),
      i("Coriander, a big handful", 1, "whole", "produce"),
      i("Limes (45 ml juice)", 2, "whole", "produce"),
      i("Red chilli", 1, "whole", "produce"),
      i("Roasted peanuts, chopped", 40, "g", "pantry"),
    ],
    method: steps(
      "Marinate the chicken for at least 30 minutes in 45 ml fish sauce, the brown sugar, grated lemongrass, crushed garlic and oil.",
      "Grill or pan-sear until charred, rest, then slice.",
      "Toss the cabbage, sliced cucumbers, grated carrots, mint and coriander.",
      "Dress with 45 ml lime juice, the remaining 15 ml fish sauce and sliced chilli.",
      "Top with the chicken and chopped peanuts.",
    ),
    source:
      "Vietnamese grilled chicken salad (4 serves). Marinate 700 g chicken thigh for at least 30 minutes in 45 ml fish sauce, 2 tsp brown sugar, 2 grated lemongrass stalks, 3 crushed garlic cloves and 1 tbsp oil. Grill or pan-sear until charred, rest, then slice. Toss 400 g finely shredded cabbage, 2 sliced cucumbers, 2 grated carrots and a big handful each of mint and coriander. Dress with 45 ml lime juice, 15 ml fish sauce and fresh chilli. Top with the chicken and 40 g chopped roasted peanuts.",
  },

  // ---------- Dinners for two ----------
  {
    name: "Snapper and white beans",
    slot: "dinner",
    kcal: 402, proteinG: 48, fibreG: 14, servings: 2,
    tags: ["fish", "beans"],
    ingredients: [
      i("Garlic cloves", 2, "whole", "produce"),
      i("Olive oil", 2, "tsp", "pantry"),
      i("Cherry tomatoes", 200, "g", "produce"),
      i("White beans, 400 g tin (drained)", 1, "whole", "pantry"),
      i("Green beans", 300, "g", "produce"),
      i("Spinach", 200, "g", "produce"),
      i("Snapper fillets", 340, "g", "meat_fish"),
      i("Lemon", 1, "whole", "produce"),
      i("Parsley", null, "whole", "produce"),
    ],
    method: steps(
      "Gently soften the sliced garlic in the olive oil, add the halved cherry tomatoes and cook for 5 minutes until collapsing.",
      "Add the drained white beans and the green beans, and simmer for 6 minutes.",
      "Fold in the spinach until wilted.",
      "Season the snapper, sear skin-side down for 3 to 4 minutes, then flip for 1 minute.",
      "Serve on the beans with lemon juice and parsley.",
    ),
    source:
      "Snapper with white beans (2 serves). Gently soften 2 sliced garlic cloves in 2 tsp olive oil, then add 200 g halved cherry tomatoes and cook for 5 minutes until collapsing. Add one 400 g tin of white beans, drained, plus 300 g green beans, and simmer for 6 minutes. Fold in 200 g spinach until wilted. Season 340 g snapper fillets, sear skin-side down for 3 to 4 minutes, flip for 1 minute, and serve on the beans with lemon juice and parsley.",
  },
  {
    name: "Tandoori chicken and dal",
    slot: "dinner",
    kcal: 478, proteinG: 52, fibreG: 12, servings: 2,
    tags: ["chicken", "lentils"],
    ingredients: [
      i("Kalo Greek yoghurt", 120, "g", "dairy"),
      i("Tandoori spice", 1, "tbsp", "pantry"),
      i("Lemon", 0.5, "whole", "produce"),
      i("Salt", null, "whole", "pantry"),
      i("Chicken breast", 260, "g", "meat_fish"),
      i("Onion, small", 1, "whole", "produce"),
      i("Garlic cloves", 2, "whole", "produce"),
      i("Ginger, grated", 1, "tsp", "produce"),
      i("Oil", 2, "tsp", "pantry"),
      i("Red lentils", 80, "g", "pantry"),
      i("Tomato", 1, "whole", "produce"),
      i("Spinach", 200, "g", "produce"),
      i("Cauliflower florets", 300, "g", "produce"),
      i("Cucumber, diced", 150, "g", "produce"),
      i("Tomatoes, diced", 150, "g", "produce"),
    ],
    method: steps(
      "Mix the yoghurt with the tandoori spice (or 2 tsp garam masala plus 1 tsp each paprika, cumin and turmeric), the lemon juice and a pinch of salt.",
      "Coat the chicken, cut into chunky pieces, and marinate for 30 minutes or overnight.",
      "For the dal, soften the diced onion, garlic and ginger in the oil. Add the lentils, chopped tomato and 500 ml water and simmer for 20 minutes, then stir in the spinach.",
      "Roast the cauliflower and chicken together at 220°C for 20 minutes.",
      "Serve with a quick salad of diced cucumber and tomato.",
    ),
    source:
      "Tandoori chicken and dal (2 serves). Mix 120 g Kalo yoghurt with 1 tbsp tandoori spice (or 2 tsp garam masala plus 1 tsp each paprika, cumin and turmeric), the juice of ½ lemon and a pinch of salt. Coat 260 g chicken breast, cut into chunky pieces, and marinate for 30 minutes or overnight. For the dal, soften 1 small diced onion, 2 garlic cloves and 1 tsp grated ginger in 2 tsp oil. Add 80 g red lentils, 1 chopped tomato and 500 ml water, simmer for 20 minutes, then stir in 200 g spinach. Roast 300 g cauliflower florets and the chicken together at 220°C for 20 minutes. Serve with a quick salad of 300 g diced cucumber and tomato.",
  },
  {
    name: "Lemon-herb chicken with roasted veg",
    slot: "dinner",
    kcal: 421, proteinG: 45, fibreG: 12, servings: 2,
    tags: ["chicken", "tray bake"],
    notes: "If the day feels light, add 100 g more kumara or a slice of toast.",
    ingredients: [
      i("Chicken breast", 340, "g", "meat_fish"),
      i("Lemon", 1, "whole", "produce"),
      i("Garlic cloves", 2, "whole", "produce"),
      i("Olive oil", 2, "tsp", "pantry"),
      i("Parsley", null, "whole", "produce"),
      i("Thyme", null, "whole", "produce"),
      i("Carrots", 300, "g", "produce"),
      i("Kumara", 200, "g", "produce"),
      i("Green beans", 300, "g", "produce"),
    ],
    method: steps(
      "Marinate the chicken in the lemon zest and juice, crushed garlic, olive oil, chopped parsley and thyme for at least 30 minutes.",
      "Roast the carrots and kumara, cut chunky, at 200°C for 15 minutes.",
      "Add the chicken and green beans to the tray and roast for another 20 minutes.",
      "Rest the chicken for 5 minutes before slicing.",
    ),
    source:
      "Lemon-herb chicken with roasted veg (2 serves). Marinate 340 g chicken breast in the zest and juice of 1 lemon, 2 crushed garlic cloves, 2 tsp olive oil, chopped parsley and thyme for at least 30 minutes. Roast 300 g carrots and 200 g kumara, both cut chunky, at 200°C for 15 minutes. Add the chicken and 300 g green beans to the tray and roast for another 20 minutes. Rest the chicken for 5 minutes before slicing.",
  },
  {
    name: "Miso salmon with greens and edamame",
    slot: "dinner",
    kcal: 470, proteinG: 42, fibreG: 8, servings: 2,
    tags: ["salmon", "fish"],
    ingredients: [
      i("White miso", 1, "tbsp", "pantry"),
      i("Ginger, grated", 1, "tsp", "produce"),
      i("Rice vinegar", 2, "tsp", "pantry"),
      i("Mirin", 1, "tsp", "pantry"),
      i("Sesame oil", 1, "tsp", "pantry"),
      i("Salmon fillets", 300, "g", "meat_fish"),
      i("Broccolini", 300, "g", "produce"),
      i("Edamame, shelled", 120, "g", "frozen"),
      i("Soy sauce", 1, "tsp", "pantry"),
      i("Lemon", 0.5, "whole", "produce"),
      i("Cucumber", 1, "whole", "produce"),
      i("Sesame seeds", 1, "tsp", "pantry"),
    ],
    method: steps(
      "Whisk the miso, ginger, 2 tsp rice vinegar, mirin and sesame oil, then brush over the two 150 g salmon fillets.",
      "Roast at 200°C for 10 to 12 minutes.",
      "Meanwhile steam the broccolini and edamame for 4 minutes and toss with a little soy and lemon juice.",
      "Serve with cucumber ribbons dressed in a little rice vinegar and sesame seeds.",
    ),
    source:
      "Miso salmon with greens and edamame (2 serves). Whisk 1 tbsp white miso, 1 tsp grated ginger, 2 tsp rice vinegar, 1 tsp mirin and 1 tsp sesame oil, then brush over 2 × 150 g salmon fillets. Roast at 200°C for 10 to 12 minutes. Meanwhile steam 300 g broccolini and 120 g edamame for 4 minutes and toss with a little soy and lemon juice. Serve with cucumber ribbons dressed in rice vinegar and sesame seeds.",
  },
  {
    name: "Sumac chicken, chickpeas, feta and spinach",
    slot: "dinner",
    kcal: 460, proteinG: 48, fibreG: 12, servings: 2,
    tags: ["chicken", "chickpeas", "feta"],
    notes: "Weigh the chicken raw. Drained chickpea weight varies by brand (230 to 260 g a tin).",
    ingredients: [
      i("Chicken breast", 300, "g", "meat_fish", [360, 68, 0]),
      i("Chickpeas, 400 g tin (drained)", 1, "whole", "pantry", [290, 17, 14]),
      i("Feta", 40, "g", "dairy", [105, 6, 0]),
      i("Red onion", 1, "whole", "produce", [45, 1, 2]),
      i("Red capsicum", 1, "whole", "produce", [45, 2, 4]),
      i("Baby spinach", 100, "g", "produce", [23, 3, 2]),
      i("Olive oil", 1, "tsp", "pantry", [40, 0, 0]),
      i("Sumac", 2, "tsp", "pantry", [4, 0, 0.5]),
      i("Ground cumin", 1, "tsp", "pantry", [6, 0.5, 0.5]),
      i("Lemon", 1, "whole", "produce", [0, 0, 0]),
      i("Parsley", null, "whole", "produce"),
    ],
    method: steps(
      "Cut the chicken into 3 cm pieces and rub with the sumac, cumin, lemon zest and olive oil.",
      "Roast at 200°C with the sliced red onion and capsicum for 10 minutes.",
      "Add the drained chickpeas, patted very dry, and roast another 10 to 15 minutes until the chickpeas are crisp at the edges and the chicken reaches 74°C.",
      "Fold through the baby spinach, parsley and lemon juice, then crumble over the feta.",
    ),
    source:
      "Sumac chicken with chickpeas, feta and spinach (2 serves). Rub 300 g chicken breast with 2 tsp sumac, 1 tsp cumin, lemon zest and 1 tsp olive oil. Roast at 200°C with 1 sliced red onion and 1 sliced capsicum for 10 minutes. Add 1 tin (400 g) drained chickpeas and roast another 10 to 12 minutes until crisp at the edges. Slice the chicken and fold it through with 100 g baby spinach, parsley and lemon juice, then crumble over 40 g feta.",
  },
  {
    name: "Halloumi, white beans and roasted veg",
    slot: "dinner",
    kcal: 450, proteinG: 32, fibreG: 11, servings: 2,
    tags: ["halloumi", "beans", "vegetarian"],
    notes: "Lowest-protein dinner, so keep the morning tea whey and the after-dinner yoghurt that day.",
    ingredients: [
      i("Zucchini", 1, "whole", "produce"),
      i("Red capsicum", 1, "whole", "produce"),
      i("Cherry tomatoes", 200, "g", "produce"),
      i("Cannellini beans, 400 g tin (drained)", 1, "whole", "pantry"),
      i("Garlic cloves", 2, "whole", "produce"),
      i("Lemon", 1, "whole", "produce"),
      i("Halloumi", 120, "g", "dairy"),
      i("Kalo Greek yoghurt", 140, "g", "dairy"),
      i("Mint", null, "whole", "produce"),
    ],
    method: steps(
      "Roast the sliced zucchini, capsicum and cherry tomatoes at 220°C with just a spray of oil.",
      "Warm the drained cannellini beans with 1 crushed garlic clove and lemon zest.",
      "Dry-fry the sliced halloumi until golden: it releases its own fat.",
      "Stir the yoghurt with mint, lemon juice and the other crushed garlic clove, and spoon it over everything.",
    ),
    source:
      "Halloumi, white beans and roasted veg (2 serves). Roast 1 sliced zucchini, 1 capsicum and 200 g cherry tomatoes at 220°C using only a spray of oil. Warm 1 tin drained cannellini beans with 1 crushed garlic clove and lemon zest. Dry-fry 120 g sliced halloumi until golden. Stir 140 g Kalo yoghurt with mint, lemon and garlic and spoon it over everything.",
  },
  {
    name: "Sardines with white beans and fennel",
    slot: "dinner",
    kcal: 490, proteinG: 39, fibreG: 10, servings: 2,
    tags: ["sardines", "fish", "beans"],
    notes: "The sardines carry plenty of oil, so there's no need to add any. Once a week is plenty.",
    ingredients: [
      i("Cannellini beans, 400 g tin (drained)", 1, "whole", "pantry"),
      i("Fennel bulb", 1, "whole", "produce"),
      i("Cherry tomatoes", 150, "g", "produce"),
      i("Capers", 1, "tbsp", "pantry"),
      i("Parsley", null, "whole", "produce"),
      i("Lemon", 1, "whole", "produce"),
      i("Sardines, tins (about 110 g drained each)", 2, "whole", "meat_fish"),
      i("Vogel's Original bread, slices", 2, "whole", "bakery"),
    ],
    method: steps(
      "Toss the drained beans with the thinly sliced fennel, halved cherry tomatoes, capers, parsley and lemon juice.",
      "Drain the sardines and lay them on top.",
      "Serve with the Vogel's, toasted.",
    ),
    source:
      "Sardines with white beans and fennel (2 serves). Toss 1 tin drained cannellini beans with 1 thinly sliced fennel bulb, 150 g halved cherry tomatoes, 1 tbsp capers, parsley and lemon juice. Drain 2 tins of sardines (about 110 g drained each) and lay them on top. Serve with 2 slices of toasted Vogel's.",
  },
  {
    name: "Crispy miso tofu with sesame greens",
    slot: "dinner",
    kcal: 450, proteinG: 41, fibreG: 8, servings: 2,
    tags: ["tofu", "vegetarian"],
    ingredients: [
      i("Firm tofu", 400, "g", "dairy"),
      i("White miso", 1, "tbsp", "pantry"),
      i("Soy sauce", 4, "tsp", "pantry"),
      i("Sesame oil", 2, "tsp", "pantry"),
      i("Bok choy or broccoli", 300, "g", "produce"),
      i("Edamame, shelled", 120, "g", "frozen"),
      i("Tahini", 1, "tbsp", "pantry"),
      i("Lime", 1, "whole", "produce"),
    ],
    method: steps(
      "Press the tofu, cube it and toss with the miso, 1 tbsp soy and the sesame oil.",
      "Bake at 220°C for 25 minutes, turning once.",
      "Steam the bok choy or broccoli with the edamame.",
      "Whisk the tahini with lime juice, 1 tsp soy and a splash of water, and spoon over.",
    ),
    source:
      "Crispy miso tofu with sesame greens (2 serves). Press 400 g firm tofu, cube it, and toss with 1 tbsp miso, 1 tbsp soy and 2 tsp sesame oil. Bake at 220°C for 25 minutes, turning once. Steam 300 g bok choy or broccoli with 120 g edamame. Whisk 1 tbsp tahini with lime juice, 1 tsp soy and a splash of water to make a sauce.",
  },
];

/** Label values from the planning chat. */
export const SEED_FOODS: FoodInput[] = [
  { name: "Kalo Greek yoghurt", unit: "g", defaultAmount: 100, kcalPer100: 90, proteinPer100: 9, fibrePer100: 0, category: "dairy", notes: "From the planning chat. Check the label." },
  { name: "Whey protein powder", unit: "g", defaultAmount: 15, kcalPer100: 387, proteinPer100: 80, fibrePer100: 0, category: "pantry", notes: "Half a scoop is 15 g. Check the label: brands vary." },
  { name: "Anchor Protein milk", unit: "ml", defaultAmount: 100, kcalPer100: 55, proteinPer100: 6, fibrePer100: 0, category: "dairy", notes: "From the planning chat. Check the label." },
  { name: "Mixed berries", unit: "g", defaultAmount: 75, kcalPer100: 44, proteinPer100: 1.3, fibrePer100: 4, category: "frozen", notes: "Frozen. From the planning chat." },
];

/** The first seed's food values, used to tell untouched seed foods from edited ones. */
const OLD_FOOD_VALUES: Record<string, [number, number, number]> = {
  "Kalo Greek yoghurt": [88, 9.3, 0],
  "Anchor Protein milk": [58, 5.5, 0],
  "Mixed berries": [47, 0.9, 4],
};

function toMealInput(m: SeedMeal): MealInput {
  return {
    name: m.name,
    slot: m.slot,
    tags: m.tags,
    servingsInRecipe: m.servings,
    method: m.method,
    source: m.source,
    kcal: m.kcal,
    proteinG: m.proteinG,
    fibreG: m.fibreG,
    nutritionStatus: "manual",
    assumptions: [],
    notes: [m.notes, ESTIMATE_NOTE].filter(Boolean).join(" "),
    ingredients: m.ingredients,
  };
}

/** Loads the seed library once. Safe to call on every start. */
export function seedIfNeeded(db: Db, userId: number | null = null): boolean {
  const done = db.select().from(appMeta).where(eq(appMeta.key, "seeded")).get();
  if (done) return false;
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    const existing = new Set(t.select({ name: meals.name }).from(meals).all().map((m) => m.name));
    for (const m of SEED_MEALS) if (!existing.has(m.name)) createMeal(t, toMealInput(m), userId);
    for (const f of SEED_FOODS) createFood(t, f, userId);
    t.insert(appMeta).values({ key: "seeded", value: new Date().toISOString() }).run();
    // A fresh library already has the full recipes.
    t.insert(appMeta).values({ key: RECIPES_V2, value: new Date().toISOString() }).run();
  });
  return true;
}

const RECIPES_V2 = "seed_recipes_v2";

export type UpgradeReport = { replaced: string[]; addedIngredients: string[]; skipped: string[]; foods: string[] };

/**
 * One-off upgrade for libraries seeded before the full recipes were added.
 * - A seed meal nobody has edited gets the full recipe and figures.
 * - An edited meal with no ingredients and no pasted recipe gets the ingredients,
 *   method and recipe text, keeping its name, numbers and notes.
 * - Anything else (deleted, or has its own ingredients or pasted recipe) is left alone.
 */
export function upgradeSeedRecipes(db: Db): UpgradeReport | null {
  if (db.select().from(appMeta).where(eq(appMeta.key, RECIPES_V2)).get()) return null;
  const report: UpgradeReport = { replaced: [], addedIngredients: [], skipped: [], foods: [] };
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    for (const seed of SEED_MEALS) {
      const meal = t.select().from(meals).where(sql`lower(${meals.name}) = ${seed.name.toLowerCase()}`).get();
      if (!meal) continue;
      const ingredientCount = t.select({ n: sql<number>`count(*)` }).from(mealIngredients).where(eq(mealIngredients.mealId, meal.id)).get()?.n ?? 0;
      const untouched = meal.updatedAt.getTime() === meal.createdAt.getTime() && meal.source === "";
      if (untouched) {
        updateMeal(t, meal.id, { ...toMealInput(seed), tags: [...new Set([...meal.tags, ...seed.tags])] });
        report.replaced.push(seed.name);
      } else if (ingredientCount === 0 && meal.source.trim() === "") {
        updateMeal(t, meal.id, {
          name: meal.name,
          slot: meal.slot,
          tags: meal.tags,
          servingsInRecipe: seed.servings,
          method: meal.method.trim() ? meal.method : seed.method,
          source: seed.source,
          kcal: meal.kcal,
          proteinG: meal.proteinG,
          fibreG: meal.fibreG,
          nutritionStatus: meal.nutritionStatus,
          assumptions: meal.assumptions,
          notes: meal.notes,
          ingredients: seed.ingredients,
        });
        report.addedIngredients.push(seed.name);
      } else {
        report.skipped.push(seed.name);
      }
    }
    for (const f of SEED_FOODS) {
      const old = OLD_FOOD_VALUES[f.name];
      const row = t.select().from(foods).where(eq(foods.name, f.name)).get();
      if (!old || !row) continue;
      if (row.kcalPer100 === old[0] && row.proteinPer100 === old[1] && row.fibrePer100 === old[2]) {
        t.update(foods).set({ kcalPer100: f.kcalPer100, proteinPer100: f.proteinPer100, fibrePer100: f.fibrePer100, notes: f.notes }).where(eq(foods.id, row.id)).run();
        report.foods.push(f.name);
      }
    }
    t.insert(appMeta).values({ key: RECIPES_V2, value: new Date().toISOString() }).run();
  });
  return report;
}
