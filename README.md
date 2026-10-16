# RasoiOS — Phase 1

**The Kitchen That Remembers, Decides & Coordinates.** Built for Renaissance 2026, Human Potential.

A local, single-household demo for Indian household kitchen coordination. No paid APIs or API credentials are needed. All business data lives in SQLite, accessed through server-side Next.js routes.

## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended) and npm. From this folder in PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run db:setup
npm.cmd run dev
```

Open **http://127.0.0.1:3000**. On macOS/Linux, use `npm` instead of `npm.cmd` and `cp .env.example .env`.

If `.env` already exists, preserve it instead of copying over it. `DATABASE_URL="file:./dev.db"` resolves to `prisma/dev.db`. The database persists across server restarts. The seed is transactional and skips an existing demo household, preserving changes on subsequent runs. Back up the SQLite file while the server is stopped. Do not run Prisma reset against a database you want to keep.

`OPENAI_API_KEY` in `.env.example` is reserved for a future phase, is not used, and must never be exposed through a `NEXT_PUBLIC_` variable. `.env` and database files are ignored by Git.

Individual database commands:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
```

Create future migrations after editing the schema with `npx.cmd prisma migrate dev --name describe_change`. Committed migrations are applied using `db:migrate`; the setup does not depend on `db push`.

Production mode:

```powershell
npm.cmd run build
npm.cmd start
```

Both development and production scripts bind to loopback. This demo has no authentication and is not suitable for public hosting or multiple unrelated households.

## Implemented

- Responsive dashboard using real database counts, selected participants, use-by alerts and recent activity.
- Household member CRUD; activate/deactivate; meal participation defaults; separate allergies and dislikes; preferred language; configurable ingredient/category exclusions and fasting rules.
- Inventory CRUD, normalized ingredient identifiers, search, category/availability filters, purchase/use-by dates, notes and explicit available/unavailable/unknown states.
- Unknown quantities are `null`, never coerced to zero. Nonnegative quantities and compatible unit conversions are validated on the server. A unit-only PATCH converts the stored amount; a PATCH with both quantity and unit treats the amount as expressed in the new unit, while still rejecting incompatible dimensions.
- Fifteen local Indian recipes, realistic ingredients, steps, serving metadata and advance preparation. Recipe labels never imply universal Jain/fasting compatibility.
- Household-specific recipe copies with ingredient, quantity, serving and step editing. One preferred household copy per local original. Original recipes are never edited by custom endpoints.
- Atomic activity logging, monotonically incremented household versions, inventory before/after events, and future meal plan/participant models.
- Accessible form labels, keyboard-operable native modal dialogs, loading/error/empty states and destructive-action confirmations.

## Folder structure

```text
prisma/
  schema.prisma                  Relational model and deletion behavior
  migrations/                    Versioned SQLite migrations
  seed.ts                        Idempotent fictional demo seed
src/
  app/
    dashboard/ household/ inventory/ recipes/
    meal-planner/ activity/       App Router pages
    api/[...path]/route.ts        REST dispatcher and JSON errors
    globals.css                  Responsive visual system, Tailwind import
  components/
    layout/ household/ inventory/ recipes/ ui/
    dashboard.tsx activity.tsx
  lib/
    db/                          Prisma singleton, transactional services
    validation/                  Strict Zod mutation schemas
    inventory/                   Unit conversion and expiry utilities
    recipes/                     Normalized ingredient/recipe seed catalog
  types/                         Serialized service response types
tests/phase1.test.ts              Isolated database and API integration tests
```

## API contract

All responses use `{ "data": ..., "error": null }` or `{ "data": null, "error": { "message": "...", "details": ... } }`.

| Resource                   | Methods                                       |
| -------------------------- | --------------------------------------------- |
| `/api/household`           | GET                                           |
| `/api/members`             | GET, POST                                     |
| `/api/members/[id]`        | GET, PATCH, DELETE                            |
| `/api/inventory`           | GET, POST                                     |
| `/api/inventory/[id]`      | PATCH, DELETE                                 |
| `/api/recipes`             | GET                                           |
| `/api/recipes/[id]`        | GET                                           |
| `/api/recipes/custom`      | POST                                          |
| `/api/recipes/custom/[id]` | PATCH (custom recipe ID, not override row ID) |
| `/api/activity`            | GET (latest 200 events)                       |
| `/api/ingredients`         | GET (canonical catalog for editors)           |

Creates return 201; successful reads/updates/deletes return 200. Malformed JSON returns 400, missing records 404, conflicting duplicates 409, and validation errors 422. Unsupported methods return 405 where applicable. Mutations with a foreign Origin are rejected. All member, inventory and custom recipe operations are scoped to the server-owned demo household. Strict schemas reject supplied household IDs and unexpected properties.

Member POST requires `name`, `dietaryPreference`, `allergies`, `dislikes`, `preferredLanguage`, `active`, `participating`, `fasting`, `excludedIngredients`, `excludedCategories` and a `fastingRule` object. Relationship is optional. Fasting rules contain four arrays (`permittedIngredients`, `prohibitedIngredients`, `permittedCategories`, `prohibitedCategories`) and `notes`. Member PATCH is partial. Deactivation clears participation; reactivation preserves the cleared default until explicitly selected.

Inventory POST requires `ingredientName`, `category`, `quantity` (number or null), `unit`, and `availability` (`AVAILABLE`, `UNAVAILABLE`, `UNKNOWN`). Optional dates use `YYYY-MM-DD`. Inventory PATCH is partial. Canonical ingredient categories are shared; an existing ingredient’s category cannot be silently reclassified by an inventory mutation.

Custom recipes require `name`, `description`, `defaultServings`, nonempty `ingredients` (`ingredientId`, `quantity`, `unit`) and a nonempty array of instruction strings. Creation also requires a valid local `originalRecipeId`. Unknown or duplicate ingredient identifiers are rejected. Add a new ingredient through inventory first.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests create and migrate an isolated `prisma/test-<process>.db`, seed it, exercise business services and actual route handlers, then remove the test database. They do not reset or mutate the demo database. Coverage includes member CRUD/rules/activation, shared-data preservation, inventory CRUD and unknown states, conversion and input rejection, recipe overrides preserving originals, HTTP response codes, origin rejection, persistence after reconnection, and atomic event versions.

Verified on Windows with Node 24.19.0, 16 October 2026:

| Check                                                   | Result                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| TypeScript strict compilation                           | Passed                                                      |
| Vitest integration suite                                | 13 tests passed                                             |
| Fresh isolated database migration and seed              | Passed                                                      |
| Repeat demo setup without data loss                     | Passed                                                      |
| Production build                                        | Passed                                                      |
| Six application pages and five main read APIs over HTTP | All returned 200                                            |
| npm dependency audit                                    | 0 known vulnerabilities at installation                     |
| Browser visual/mobile interaction QA                    | Not performed: no browser surface available in this session |

The Prisma CLI overrides pin patched `effect` and `deepmerge-ts` versions; migration, generation, seed and tests were checked with those overrides. The optional Windows Rolldown binding avoids a missing optional dependency in the test runner installation. The migration wrapper exclusively creates an absent SQLite file before applying migrations, working around a first-run Windows schema-engine failure without truncating an existing database.

## Limits and Phase 2 handoff

- Phase 1 stores preferences; it does not solve dietary compatibility or certify any recipe as safe for allergies, Jain practices or fasting. Fasting allowed lists do not yet imply closed-world semantics; the future solver must define and explain precedence, including allergy exclusions.
- Participation is a saved household default; scheduling actual meals is a Phase 2 task. `MealPlan` and `MealParticipant` provide the foundation. Member deletion sets historical participant references to null while retaining name snapshots.
- No AI, voice, YouTube, recommendations, automatic replanning, shopping or payments are implemented. Future UI is labeled as coming in Phase 2/3.
- Inventory expiry is a user-provided date, not an assessment of food safety. Use-soon alerts include today through three days ahead and flag expired items separately.
- Units use explicit culinary conventions (240 ml/cup, 15 ml/tbsp, 5 ml/tsp). Mass/volume conversion requires future ingredient-specific density; count conversion requires piece weights. Recipe serving scaling should multiply quantities by requested/default servings and preserve unknown inventory amounts.
- Household recipe metadata is inherited from its original; the UI calls this out. A future dietary engine must recompute from actual ingredients and household rules after every edit.
- Inventory events, custom overrides and state versions are committed in the same transactions as edits. Future replanning should read a household version, calculate requirements using canonical IDs, and verify the version before committing a plan. Add explicit plan revision/idempotency handling before background jobs.
- Add authentication, authorization, user-selected households and deployment-grade operational controls before multi-user hosting. Never accept household IDs solely from browser input.
- Add the OpenAI adapter only on the server, validate generated recipes with Zod, mark source `AI_GENERATED`, and retain provenance. Language preferences are already stored; tutorial and voice integrations remain separate future adapters.
