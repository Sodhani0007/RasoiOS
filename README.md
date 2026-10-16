# RasoiOS - Phase 3 + Phase 4

**The Kitchen That Remembers, Decides & Coordinates.** Built for Renaissance 2026, Human Potential.

A login-free application for trusted-household kitchen coordination, with separate Family and Cook views. Local recipe resolution, dietary verification and meal planning need no paid API. AI uses Gemini for recipes and Groq for kitchen commands, with one controlled provider fallback. Local data uses SQLite; PostgreSQL migrations and safe data transfer are prepared for Vercel.

See [PHASE34.md](PHASE34.md) for current implementation and test results, and [DEPLOYMENT.md](DEPLOYMENT.md) for exact Vercel website and PostgreSQL migration steps. [PHASE25.md](PHASE25.md) and [PHASE2.md](PHASE2.md) retain historical implementation details.

**Login-free access limitation:** The application cannot prove whether a visitor is family or cook. Cook View and its strict endpoints keep meal choices operationally read-only, but anyone can switch views or call a family endpoint. This is a trusted local demo, not role-based access security.

## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended) and npm. From this folder in PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run db:setup
npm.cmd run demo:showcase
npm.cmd run build
npm.cmd start
```

Open **http://127.0.0.1:3000**. Choose **Enter Family View** or **Enter Cook View**; no credentials are needed. Select an existing profile in Family View. On macOS/Linux, use `npm` instead of `npm.cmd` and `cp .env.example .env`.

If `.env` already exists, preserve it instead of copying over it. `DATABASE_URL="file:./dev.db"` resolves to `prisma/dev.db`. The database persists across server restarts. The seed is transactional and skips an existing demo household, preserving changes on subsequent runs. Back up the SQLite file while the server is stopped. Do not run Prisma reset against a database you want to keep.

Set `GEMINI_API_KEY` and `GROQ_API_KEY` in `.env.local` to enable AI. Defaults are `gemini-3.1-flash-lite` and `openai/gpt-oss-120b`; see `.env.example` for provider controls. Local planning works without keys. OpenAI remains optional and unverified. Never expose keys through `NEXT_PUBLIC_`. Environment files and databases are ignored by Git.

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

Both development and production scripts bind to loopback. Data APIs require no session. Household/profile selection scopes records but does not establish identity; see the trusted-household limitation in PHASE25.md.

## Implemented

- Phase 2.5: login-free Family/Cook views, independent dated meal requests with multiple dishes, family-confirmed substitutions, deterministic coordination, read-only cook choices, preparation progress and reports.
- 6,865 verified real Mendeley recipe imports, raw quantity preservation, repeat-import deduplication and household-first search.
- Live dropdown autocomplete, atomic multi-dish selections, confirmed shortage reports with known alternatives, and YouTube tutorial links.
- Editable AI drafts with fresh dietary checks and explicit confirmation; real Gemini recipes, Groq commands and recipe fallback verified.

- Phase 2: household-first recipe resolution, ingredient scaling, deterministic dietary/fasting/allergy checks, aggregated shortages, explainable shared/two-dish recommendations, reviewed AI generation and persistent meal snapshots. See [Phase 2 details](PHASE2.md).

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

Creates return 201; successful reads/updates/deletes return 200. Malformed JSON returns 400, missing records 404, conflicting duplicates 409, and validation errors 422. Unsupported methods return 405 where applicable. Mutations with a foreign Origin are rejected. All member, inventory and custom recipe operations are scoped to the selected household. Household/profile selection is not authentication. Strict schemas reject supplied household IDs and unexpected properties.

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

| Check                                      | Result                                                        |
| ------------------------------------------ | ------------------------------------------------------------- |
| TypeScript strict compilation              | Passed                                                        |
| Vitest integration suite                   | 82 tests passed                                               |
| Fresh isolated database migration and seed | Passed                                                        |
| Repeat demo setup without data loss        | Passed                                                        |
| Production build                           | Passed                                                        |
| Login-free pages and APIs over HTTP        | 64 checks passed                                              |
| npm dependency audit                       | 0 known vulnerabilities at installation                       |
| Browser visual/mobile interaction QA       | 13 real Chromium checks passed; desktop screenshots inspected |

The Prisma CLI overrides pin patched `effect` and `deepmerge-ts` versions; migration, generation, seed and tests were checked with those overrides. The optional Windows Rolldown binding avoids a missing optional dependency in the test runner installation. The migration wrapper exclusively creates an absent SQLite file before applying migrations, working around a first-run Windows schema-engine failure without truncating an existing database.

## Current limits

The current engine verifies configured ingredient-level rules and flags uncertainty; it does not guarantee allergen-free preparation. Unknown inventory is never treated as sufficient. Meal snapshots are historical, and planning never deducts stock. Live OpenAI generation, hosted PostgreSQL persistence and public Vercel deployment remain unverified. The user will connect PostgreSQL and deploy through the Vercel website. Anyone with access can switch views or call family APIs; separate cook endpoints and hidden controls are not identity-based security.

See [PHASE2.md](PHASE2.md) for all new endpoints, the additive migration, scoring weights, draft lifecycle, fasting semantics, automated verification, known limits and the Phase 3 integration handoff.
