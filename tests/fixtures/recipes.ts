/**
 * Recipes for the AI import, with rough per-serve ranges we expect back.
 * Used by tests/ai-live.test.ts, which only runs with RUN_AI_TESTS=1 and an API key.
 */
export type RecipeFixture = {
  name: string;
  text: string;
  servings: number;
  kcal: [number, number];
  protein: [number, number];
  fibre: [number, number];
};

export const RECIPE_FIXTURES: RecipeFixture[] = [
  {
    name: "Overnight oats",
    servings: 1,
    text: `Overnight oats (1 serve)
40 g rolled oats
12 g chia seeds
50 g Kalo Greek yoghurt
150 ml Anchor Protein milk
pinch of cinnamon
Mix everything in a jar and refrigerate overnight.`,
    kcal: [280, 400],
    protein: [17, 27],
    fibre: [7, 11],
  },
  {
    name: "Snapper and white beans",
    servings: 2,
    text: `Snapper with white beans and lemon (serves 2)
2 snapper fillets, about 300 g total
1 x 400 g tin cannellini beans, drained
2 cloves garlic, sliced
1 tsp olive oil
1 lemon, zest and juice
100 g baby spinach
small handful parsley
1. Warm the oil, soften the garlic, add the beans and lemon zest with a splash of water and heat through.
2. Season the snapper and pan-fry 3 minutes a side.
3. Stir the spinach through the beans until wilted, add lemon juice and parsley, top with the fish.`,
    kcal: [280, 450],
    protein: [35, 50],
    fibre: [6, 14],
  },
  {
    name: "Sumac chicken with chickpeas and feta",
    servings: 2,
    text: `Sumac chicken, chickpeas, feta and spinach. Serves 2.
- 350g chicken breast
- 2 tsp sumac
- 400g can chickpeas, drained and rinsed
- 60g feta, crumbled
- 120g spinach
- 1 red onion, sliced
- 1 tbsp lemon juice
Rub chicken with sumac and roast at 200°C for 20 min. Roast chickpeas and onion alongside. Toss with spinach, lemon and feta, slice chicken on top.`,
    kcal: [400, 560],
    protein: [44, 60],
    fibre: [8, 14],
  },
  {
    name: "Crispy miso tofu with greens",
    servings: 2,
    text: `Crispy miso tofu with sesame greens, for two
300 g firm tofu, cubed
1 tbsp white miso
1 tbsp soy sauce
1 tsp sesame oil
1 tbsp cornflour
200 g broccolini
150 g frozen edamame
1 tbsp sesame seeds
Toss tofu in cornflour and bake at 220C until crisp. Whisk miso, soy and sesame oil, toss with tofu. Steam broccolini and edamame, scatter sesame seeds.`,
    kcal: [300, 480],
    protein: [24, 40],
    fibre: [6, 13],
  },
  {
    name: "Imperial units are converted",
    servings: 4,
    text: `Chicken and lentil soup. Serves 4.
1 lb boneless chicken thighs
1 cup dried red lentils
1 onion, 2 carrots, 2 celery sticks, diced
4 cups chicken stock
2 cups chopped kale
Simmer everything except kale for 25 minutes at a gentle boil, shred chicken, add kale for the last 5 minutes.`,
    kcal: [280, 420],
    protein: [28, 42],
    fibre: [6, 13],
  },
];
