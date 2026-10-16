import "dotenv/config";
import { requestRecipe, defaultModel } from "../src/lib/ai/openai-client";
import { validateGeneratedRecipe } from "../src/lib/recipes/generator";
import { db } from "../src/lib/db";
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log(
      "NOT VERIFIED: OPENAI_API_KEY is not configured. No external call was made.",
    );
    return;
  }
  const raw = await requestRecipe(
    JSON.stringify({
      dish: "Lemon cumin rice",
      servings: 2,
      language: "English",
      mealCategory: "lunch",
      maxMinutes: 40,
      restrictions: [{ profile: "Vegetarian", allergies: [], exclusions: [] }],
    }),
  );
  const result = validateGeneratedRecipe(raw);
  console.log(
    JSON.stringify(
      {
        liveApiResponseValidated: true,
        model: process.env.OPENAI_MODEL || defaultModel,
        name: result.recipe.name,
        ingredients: result.recipe.ingredients.length,
        warnings: result.warnings,
        persisted: false,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Live API check failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
