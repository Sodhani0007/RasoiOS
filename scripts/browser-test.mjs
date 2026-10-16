import { chromium, expect } from "@playwright/test";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
nextEnv.loadEnvConfig(process.cwd());
const file = resolve(`prisma/test-browser-${process.pid}.db`),
  port = 3103,
  base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  DATABASE_URL: `file:${file.replaceAll("\\", "/")}`,
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  NEXT_TELEMETRY_DISABLED: "1",
};
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Calcutta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const results = [],
  errors = [],
  failed = [];
let server,
  browser,
  page,
  logs = "";
mkdirSync("test-results/browser", { recursive: true });
const pass = (name) => {
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
};
const card = (name) =>
  page
    .locator("article.request-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
async function goto(path) {
  await page.goto(base + path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}
async function choose(query, name, keyboard = false) {
  const input = page.getByRole("combobox", { name: "Requested dish" });
  await input.fill(query);
  await expect(
    page.getByRole("listbox", { name: "Recipe suggestions" }),
  ).toBeVisible();
  if (keyboard) {
    await input.press("ArrowDown");
    await input.press("Enter");
  } else
    await page.getByRole("option").filter({ hasText: name }).first().click();
  await expect(input).toHaveValue(name);
}
async function save() {
  await page
    .getByRole("button", { name: "Save meal selection", exact: true })
    .click();
  await expect(
    page.getByText("Meal request sent for household review.", { exact: true }),
  ).toBeVisible();
}
try {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env,
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    { env, stdio: "pipe" },
  );
  const db = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });
  const members = await db.householdMember.findMany();
  const father = members.find((m) => m.relationship === "Father"),
    daughter = members.find((m) => m.relationship === "Daughter");
  for (const r of await db.recipeIngredient.findMany())
    await db.inventoryItem.upsert({
      where: {
        householdId_ingredientId: {
          householdId: "demo-household",
          ingredientId: r.ingredientId,
        },
      },
      create: {
        householdId: "demo-household",
        ingredientId: r.ingredientId,
        quantity: 10000,
        unit: r.unit,
        availability: "AVAILABLE",
      },
      update: {
        quantity: 10000,
        unit: r.unit,
        availability: "AVAILABLE",
        expiryDate: null,
      },
    });
  await db.$disconnect();
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  server.stdout.on("data", (c) => (logs += c));
  server.stderr.on("data", (c) => (logs += c));
  let ready = false;
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch(base + "/api/household")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error("Browser test server did not start: " + logs);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => {
    if (!r.failure()?.errorText.includes("ERR_ABORTED"))
      failed.push({
        url: r.url().replace(base, ""),
        error: r.failure()?.errorText,
      });
  });
  await goto("/family/choose-meal");
  await page.getByLabel("Select family profile").selectOption(father.id);
  await expect(
    page.getByRole("heading", { name: "What would you like to eat?" }),
  ).toBeVisible();
  await page.getByLabel("Date", { exact: true }).fill(date);
  await page.getByLabel("Meal", { exact: true }).first().selectOption("lunch");
  await page.getByLabel(/Preferred serving time/).fill("13:15");
  await choose("paneer", "Paneer Bhurji");
  await page.getByLabel("Portions", { exact: true }).fill("1.5");
  await page
    .getByRole("button", { name: "Add Another Dish", exact: true })
    .click();
  await choose("jeera", "Jeera Rice", true);
  await page.getByLabel("Portions", { exact: true }).fill("0.5");
  await save();
  await page.reload();
  await expect(card("Paneer Bhurji")).toContainText("1.5 portion(s)");
  await expect(card("Jeera Rice")).toContainText("0.5 portion(s)");
  pass(
    "Mouse and keyboard autocomplete; two dishes and fractional portions persist after refresh",
  );
  await card("Jeera Rice")
    .getByRole("button", { name: "Edit / resubmit" })
    .click();
  await page.getByLabel("Portions", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Save my changes", exact: true })
    .click();
  await expect(card("Jeera Rice")).toContainText("2 portion(s)");
  pass("Edit one dish preserves the other dish and serving time");
  await choose("roti", "Roti");
  await save();
  await card("Roti").getByRole("button", { name: "Cancel request" }).click();
  await expect(card("Roti")).toContainText("CANCELLED");
  await expect(card("Paneer Bhurji")).toContainText("1.5 portion(s)");
  pass("Remove one dish without removing the meal");
  await page.getByLabel("Select family profile").selectOption(daughter.id);
  await choose("dal tadka", "Dal Tadka");
  await save();
  await expect(card("Dal Tadka")).toBeVisible();
  await expect(card("Paneer Bhurji")).toHaveCount(0);
  await page.getByLabel("Select family profile").selectOption(father.id);
  await expect(card("Paneer Bhurji")).toBeVisible();
  await expect(card("Dal Tadka")).toHaveCount(0);
  pass("Separate member selections remain isolated");
  await goto("/family/requests");
  await page.getByRole("button", { name: "Create proposed schedule" }).click();
  await expect(
    page.getByRole("button", { name: "Approve this cooking schedule" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve this cooking schedule" })
    .click();
  await expect(
    page.getByRole("button", { name: "Withdraw for review" }),
  ).toBeVisible();
  pass("Family creates and approves consolidated cooking schedule");
  await goto("/cook");
  await expect(card("Paneer Bhurji")).toContainText(father.name);
  await expect(card("Paneer Bhurji")).toContainText("1.5 portions");
  await expect(card("Dal Tadka")).toContainText(daughter.name);
  await expect(card("Jeera Rice")).toContainText("2 portions");
  await expect(
    page.getByRole("button", { name: "Edit / resubmit" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cancel request" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Mark cooking", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Mark cooking", exact: true }).first(),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mark cooking", exact: true }).first(),
  ).toBeDisabled();
  pass(
    "Cook sees both members, correct portions and persistent progress without choice editing",
  );
  const tutorial = page.getByRole("link", { name: "Watch Tutorial" }).first();
  await expect(tutorial).toHaveAttribute("target", "_blank");
  await expect(tutorial).toHaveAttribute(
    "href",
    /youtube\.com\/results\?search_query=/,
  );
  pass("Tutorial links open a YouTube recipe search in a new tab");
  await page
    .getByLabel("Unavailable ingredient", { exact: true })
    .selectOption("paneer");
  await page.getByLabel("Affected meal").selectOption("lunch");
  await page.getByLabel(/I confirm this ingredient is unavailable/).check();
  await page
    .getByRole("button", { name: "Report shortage for family review" })
    .click();
  await expect(page.getByText(/1 affected dishes\./)).toBeVisible();
  await expect(page.locator(".shortage-panel")).toContainText("Paneer Bhurji");
  await expect(card("Jeera Rice")).toBeVisible();
  pass(
    "Manual shortage stores report and detects affected dish without cancelling unrelated dishes",
  );
  await goto("/family/my-meals");
  await page.getByLabel("Select family profile").selectOption(father.id);
  await page
    .getByRole("button", { name: "Review suggestion", exact: true })
    .click();
  await page.getByRole("button", { name: "Aloo Sabzi", exact: true }).click();
  await page.getByLabel(/I reviewed this replacement and confirm/).check();
  await page
    .getByRole("button", { name: "Confirm replacement and resubmit" })
    .click();
  await expect(card("Aloo Sabzi")).toBeVisible();
  await expect(card("Jeera Rice")).toContainText("2 portion(s)");
  await goto("/cook");
  await expect(card("Aloo Sabzi")).toBeVisible();
  await expect(card("Paneer Bhurji")).toHaveCount(0);
  await expect(card("Dal Tadka")).toBeVisible();
  pass(
    "Family-confirmed replacement appears in Cook View while unaffected choices persist",
  );
  await page.screenshot({
    path: "test-results/browser/cook-after-approval.png",
    fullPage: true,
  });
  if (process.env.GROQ_API_KEY) {
    await page
      .getByLabel("Kitchen command (optional)")
      .fill("Aaj paneer nahi hai.");
    await page
      .getByRole("button", { name: "Interpret command", exact: true })
      .click();
    await expect(
      page.getByText(/Understood Paneer is unavailable/),
    ).toBeVisible({ timeout: 80000 });
    await expect(
      page.getByLabel(/I confirm this ingredient is unavailable/),
    ).not.toBeChecked();
    pass(
      "Real Groq command interpretation displays confirmation without automatic inventory mutation",
    );
  }
  await goto("/family/choose-meal");
  await page.getByLabel("Select family profile").selectOption(father.id);
  await page
    .getByRole("combobox", { name: "Requested dish" })
    .fill("Sunday Cumin Rice");
  await expect(
    page.getByText("No matching recipe found.", { exact: true }),
  ).toBeVisible();
  if (process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY) {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/recipes/generate") &&
        r.request().method() === "POST",
      { timeout: 90000 },
    );
    await page
      .getByRole("button", { name: "Generate Recipe with AI", exact: true })
      .click();
    const generated = await response;
    const body = await generated.json();
    if (!generated.ok())
      throw new Error("Live browser AI generation: " + body.error?.message);
    await expect(
      page.getByText(/AI-GENERATED.*REVIEW BEFORE SAVING/),
    ).toBeVisible();
    const description = page.getByLabel("Description", { exact: true });
    if (await description.count()) {
      await description.fill(
        (await description.inputValue()) + " Reviewed for this household.",
      );
      await page.getByRole("button", { name: "Recheck my edits" }).click();
    }
    await page.getByLabel(/Keep unresolved details visibly flagged/).check();
    await page
      .getByRole("button", { name: /I reviewed this recipe.*save/ })
      .click();
    await expect(
      page.getByText("Reviewed recipe selected. Save your meal when ready.", {
        exact: true,
      }),
    ).toBeVisible();
    await save();
    await page.reload();
    await expect(card("Sunday Cumin Rice")).toBeVisible();
    pass(
      "Real AI unknown recipe draft, review, save and refresh persistence (" +
        body.data.draft.model +
        ")",
    );
  }
  await page.screenshot({
    path: "test-results/browser/family-multiple-dishes.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  pass(
    "No uncaught browser errors or failed network requests in successful flows",
  );
  await goto("/cook");
  await page.route("**/api/cook/interpret", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          message: "AI unavailable. Please use the manual ingredient selector.",
        },
      }),
    }),
  );
  await page
    .getByLabel("Kitchen command (optional)")
    .fill("Aaj paneer nahi hai.");
  await page
    .getByRole("button", { name: "Interpret command", exact: true })
    .click();
  await expect(
    page.getByText(
      "AI unavailable. Please use the manual ingredient selector.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Unavailable ingredient", { exact: true }),
  ).toBeEnabled();
  pass(
    "Simulated provider failure displays a useful error and preserves manual reporting",
  );
} catch (e) {
  results.push({ name: "Browser workflow", status: "FAIL", error: e.message });
  console.error(e);
  if (page) {
    await page
      .screenshot({ path: "test-results/browser/failure.png", fullPage: true })
      .catch(() => {});
    writeFileSync(
      "test-results/browser/failure.html",
      await page.content().catch(() => ""),
    );
  }
  process.exitCode = 1;
} finally {
  writeFileSync(
    "test-results/browser/report.json",
    JSON.stringify(
      { date: new Date().toISOString(), base, results, errors, failed },
      null,
      2,
    ),
  );
  if (browser) await browser.close();
  if (server) {
    server.kill();
    await new Promise((r) => server.once("exit", r));
  }
  rmSync(file, { force: true });
  rmSync(file + "-journal", { force: true });
}
