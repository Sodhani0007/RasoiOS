import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Home } from "../src/components/portals/home";
import { RecipeAnalysis } from "../src/components/recipes/RecipeAnalysis";
import { RecipeDiscovery } from "../src/components/recipes/RecipeDiscovery";
import {
  CookRequestCard,
  type CookRequests,
} from "../src/components/portals/cook-requests";
import {
  ScheduleCard,
  type ScheduleResponse,
} from "../src/components/portals/schedules";
it("renders direct Family and Cook entry links", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain('href="/family"');
  expect(html).toContain('href="/cook"');
  expect(html).toContain("Enter Family View");
  expect(html).toContain("Enter Cook View");
  expect(html).not.toMatch(/sign in|password|login/i);
});
it("starts a recipe check with the selected meal date, type and fractional portion", () => {
  const html = renderToStaticMarkup(
    <RecipeAnalysis
      recipeId="roti"
      baseServings={4}
      context={{
        memberIds: ["mother"],
        date: "2026-11-04",
        mealType: "lunch",
        servings: 1.25,
      }}
    />,
  );
  expect(html).toContain('value="2026-11-04"');
  expect(html).toContain('value="1.25"');
  expect(html).toContain('<option selected="">lunch</option>');
  expect(html).toContain('step="0.25"');
});
it("uses the meal's requested dish as the recipe search query", () => {
  const html = renderToStaticMarkup(
    <RecipeDiscovery
      request={{
        dishName: "Paneer Sabzi",
        memberIds: ["mother"],
        date: "2026-11-04",
        mealType: "lunch",
        servings: 1,
        maxMinutes: 120,
        cuisine: "Indian",
        preferredLanguage: "English",
      }}
      onQueryChange={() => {}}
    />,
  );
  expect(html).toContain('value="Paneer Sabzi"');
});
it("renders cook choices and progress without meal-edit, delete, cancel or approval controls", () => {
  const request = {
    id: "r",
    member: { name: "Mother" },
    mealDate: "2026-11-02",
    mealType: "lunch",
    preferredTime: "13:00",
    requestedDishName: "Paneer Sabzi",
    servings: 1,
    status: "APPROVED",
    attendance: "HOME",
    notes: "No onion",
    assessment: {
      reason: "Ready",
      recipe: null,
      inventory: null,
      verification: null,
    },
  } as CookRequests[number];
  const recipeSnapshot = {
    name: "Paneer Sabzi",
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 20,
    startTime: "12:35",
    participants: [
      {
        memberId: "m",
        name: "Mother",
        servings: 1,
        preferredTime: "13:00",
        preparationRules: ["No onion"],
      },
    ],
    language: "English",
    instructions: [{ text: "Cook the paneer." }],
    ingredients: [],
  };
  const schedule = {
    id: "s",
    mealDate: "2026-11-02",
    mealType: "lunch",
    timezone: "Asia/Calcutta",
    status: "APPROVED",
    needsRecheck: false,
    reports: [],
    dishes: [
      { id: "d", servings: 1, preparationStatus: "PENDING", recipeSnapshot },
    ],
    snapshot: {
      dishes: [recipeSnapshot],
      workload: 25,
      issues: [],
      inventory: {
        status: "READY",
        ingredients: [],
        groceries: [],
        confirmations: [],
      },
      notice: "Stock unchanged",
    },
  } as unknown as ScheduleResponse["schedules"][number];
  const html = renderToStaticMarkup(
    <>
      <CookRequestCard request={request} />
      <ScheduleCard cook schedule={schedule} onChange={async () => {}} />
    </>,
  );
  expect(html).toContain("Mother");
  expect(html).toContain("13:00");
  expect(html).toContain("Start preparation");
  expect(html).toContain("Mark cooking");
  expect(html).toContain("Mark ready");
  expect(html).toContain("Mark completed");
  const buttons = [...html.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)]
    .map((m) => m[1])
    .join(" ");
  expect(buttons).not.toMatch(
    /edit|delete|cancel|replace|approve|withdraw|confirm replacement/i,
  );
  expect(html).not.toMatch(/href="\/(household|family\/choose-meal)/);
  expect(html).toContain("Send substitution suggestion");
});
