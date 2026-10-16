import "dotenv/config";
import { db } from "../src/lib/db";
import { householdContext } from "../src/lib/household-context";
import { saveRecipe, getRecipe } from "../src/lib/db/service";
async function main() {
  const householdId = "phase25-showcase";
  if (await db.household.findUnique({ where: { id: householdId } })) {
    console.log("Showcase already exists; preserving it.");
    return;
  }
  await db.household.create({
    data: {
      id: householdId,
      name: "The Mehta Family - Fictional Showcase",
      timezone: "Asia/Calcutta",
    },
  });
  const profiles = [
    { name: "Mother", dietaryPreference: "Jain", fasting: false },
    { name: "Father", dietaryPreference: "Non-vegetarian", fasting: false },
    { name: "Daughter", dietaryPreference: "Vegetarian", fasting: false },
    { name: "Grandmother", dietaryPreference: "Vegetarian", fasting: true },
  ];
  for (const p of profiles) {
    const member = await db.householdMember.create({
      data: {
        ...p,
        householdId,
        relationship: p.name,
        allergies: [],
        dislikes: [],
        preferredLanguage: "English",
        ...(p.name === "Mother"
          ? {
              dietaryRules: {
                create: [
                  {
                    target: "CATEGORY",
                    value: "root-vegetables",
                    action: "EXCLUDE",
                  },
                  { target: "INGREDIENT", value: "onion", action: "EXCLUDE" },
                  { target: "INGREDIENT", value: "garlic", action: "EXCLUDE" },
                ],
              },
            }
          : {}),
        ...(p.fasting
          ? {
              fastingRule: {
                create: {
                  permittedIngredients: [
                    "sabudana",
                    "potato",
                    "peanuts",
                    "ghee",
                    "cumin",
                    "green-chilli",
                    "rock-salt",
                    "coriander",
                    "lemon",
                    "water",
                  ],
                  prohibitedIngredients: ["onion", "garlic"],
                  permittedCategories: [],
                  prohibitedCategories: [],
                  notes:
                    "Fictional family's explicitly chosen fast; not a universal fasting rule.",
                },
              },
            }
          : {}),
      },
    });
  }

  await householdContext.run({ householdId }, async () => {
    for (const id of ["paneer-bhurji", "chicken-curry"]) {
      const original = await getRecipe(id);
      const paneer = id === "paneer-bhurji";
      const removed = paneer
        ? ["onion", "garlic", "ginger", "garam-masala"]
        : ["garam-masala"];
      await saveRecipe({
        originalRecipeId: id,
        name: paneer ? "Jain Paneer Sabzi" : "Chicken Curry",
        description:
          "Fictional household recipe with explicit ingredients for review.",
        defaultServings: original.defaultServings,
        ingredients: original.ingredients
          .filter((i) => !removed.includes(i.ingredientId))
          .map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unit: i.unit,
          })),
        instructions: paneer
          ? [
              "Prepare the listed vegetables and crumble paneer. Check labels and use clean utensils.",
              "Warm oil and cumin, then soften the listed tomato, capsicum and spices.",
              "Add paneer and salt. Cook gently until hot and finish with coriander.",
            ]
          : original.instructions.map((i) =>
              i.text.replace(
                /garam masala/gi,
                "the individually listed spices",
              ),
            ),
      });
    }
    for (const [ingredientId, quantity, unit] of [
      ["rice", 1000, "g"],
      ["paneer", 500, "g"],
      ["chicken", 1000, "g"],
      ["atta", 1000, "g"],
    ] as const)
      await db.inventoryItem.create({
        data: {
          householdId,
          ingredientId,
          quantity,
          unit,
          availability: "AVAILABLE",
        },
      });
  });
  console.log(
    "Showcase created. Select it in the household menu; no login is needed.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
