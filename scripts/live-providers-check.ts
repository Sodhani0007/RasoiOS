import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { requestRecipe, interpretCommand, configured, providerModel } =
    await import("../src/lib/ai/service");
  for (const provider of ["gemini", "groq"] as const) {
    if (!configured(provider)) {
      console.log(
        JSON.stringify({ provider, status: "BLOCKED", reason: "missing key" }),
      );
      continue;
    }
    try {
      const result =
        provider === "gemini"
          ? await requestRecipe(
              JSON.stringify({
                dish: "Simple cumin rice",
                cuisine: "Indian",
                servings: 2,
                mealCategory: "lunch",
                language: "English",
                maxMinutes: 30,
                restrictions: [{ profile: "Vegetarian" }],
                availableIngredients: [
                  { ingredientId: "rice", quantity: 200, unit: "g" },
                  { ingredientId: "cumin", quantity: 2, unit: "g" },
                  { ingredientId: "water", quantity: 400, unit: "ml" },
                  { ingredientId: "salt", quantity: 2, unit: "g" },
                ],
              }),
              provider,
            )
          : await interpretCommand("Aaj paneer nahi hai.", provider);
      console.log(
        JSON.stringify({
          provider,
          model: result.model,
          status: "PASS",
          validated: true,
          ...(provider === "groq" ? { command: result.data } : {}),
        }),
      );
    } catch (e) {
      console.log(
        JSON.stringify({
          provider,
          model: providerModel(provider),
          status: "FAIL",
          error: (e as Error).message,
        }),
      );
      process.exitCode = 1;
    }
  }
}
main().catch(() => {
  console.error("Provider check could not start.");
  process.exitCode = 1;
});
