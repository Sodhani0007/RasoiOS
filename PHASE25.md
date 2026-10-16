# RasoiOS Phase 2.5 — Login-free Family and Cook views

The existing Next.js, React, Prisma and SQLite application now opens directly at `/`. No login, password, OTP, account provisioning, session cookie or authentication redirect is used. Household records, member IDs, preferences, inventory, recipes, requests and saved schedules remain intact.

## Start

For an existing installation, preserve `.env` and the database:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run build
npm.cmd start
```

Open **http://127.0.0.1:3000** and choose **Enter Family View** or **Enter Cook View**. The top bar always offers both views and a household selector. Production mode avoids development hot-reload interruptions during demos. Stop a running server before regenerating Prisma on Windows.

For a fresh installation, run `npm.cmd ci`, create `.env` from `.env.example` only if absent, then run `npm.cmd run db:setup`. Optional `npm.cmd run demo:showcase` adds a fictional household and never resets an existing one. It creates profiles and recipes, not accounts or passwords.

`DATABASE_URL="file:./dev.db"` points to `prisma/dev.db`. Optional server-only `OPENAI_API_KEY` enables unknown-dish generation; `OPENAI_MODEL` defaults to `gpt-5-mini`. Local search, planning and deterministic checks do not need OpenAI credentials. Never use a `NEXT_PUBLIC_` key.

## Trusted-household limitation

This is a login-free prototype for a trusted household. **The server cannot prove whether someone is a family member or a cook.** Anyone with access can switch views, select another profile or call a family endpoint directly. Separate routes, strict payloads and hidden buttons are operational boundaries, not identity authentication or role-based security. Household/profile headers are freely selected data scopes, not credentials. Keep this local prototype on its default loopback address.

## Family workflow

1. Open `/family` and select an existing active household member. The selection is remembered for this browser tab, including reloads. Other tabs can choose different households and profiles without changing where this tab submits meals.
2. Use **Choose My Meal**. Select date, breakfast/lunch/snack/dinner, preferred serving time, servings and notes. Search existing recipes or request a dish that is not yet known.
Recipe search follows the requested dish name. Recipe checks start with the selected profile, date, meal type and exact portions; fractional portions are scaled without rounding up. Choosing a different recipe or meal context clears the previous check.

3. Save each dish separately. Multiple dishes in one meal and multiple meals per day are supported. One profile never overwrites another profile's choices. Skip/outside attendance cannot coexist with active at-home choices for that profile and meal; change or cancel conflicting choices first.
4. Edit, cancel or resubmit from **My meals**. Editing/cancelling an approved choice withdraws the affected cooking schedule and marks its requests for review. The cook no longer receives that outdated assignment.
5. **Coordinate meals** (`/family/requests`) shows household requests, deterministic dietary assessments, ingredient shortages, request history and schedule proposals. Approvals require verified dietary compatibility and explicit acknowledgement of shortages/unknown stock. Approval does not deduct inventory.
6. Cook reports appear under **Updates from the cook** for relevant meal dates. Substitution suggestions remain pending until the selected family profile reviews them. Declining leaves the request unchanged. Accepting requires a reviewed replacement recipe and explicit confirmation. For an ingredient swap, first create a household recipe copy with the actual substituted ingredients and instructions. Dietary verification runs again, and the changed meal is resubmitted for schedule review.

An outdated suggestion cannot be applied after its original request revision changes. No automatic recipe replacement occurs. Dates and serving times remain household-local wall-clock values; timezone changes are blocked after meal requests exist.

The household overview, profiles, inventory, recipe library, meal planner and activity history remain available from Family View. Legacy `/admin/requests` and `/admin/settings` links remain compatible; they are family coordination pages and do not imply an authenticated administrator role.

## Cook workflow

`/cook` shows family meal choices as read-only cards and approved schedules grouped by meal. Cards include member, requested dish, date/time, portions, request status, notes and recipe/ingredient assessments. Pending requests are clearly distinguished from approved cooking assignments.

Approved assignments retain per-member servings, serving times, relevant dietary preparation rules, recipe steps, scaled ingredients, consolidated shortages and advance preparation reminders. Original instructions remain visible when no verified translation exists. The cook's language preference is stored on the household.

Cook actions are limited to preparation progress (`PENDING`, `PREPARING`, `COOKING`, `READY`, `COMPLETED`), ingredient-unavailable reports, incorrect-instruction reports, cooking notes and substitution suggestions. Progress changes only `MealScheduleDish`. Reports/notes live in `CookReport`; suggestions live in `CookSuggestion`. Every cook action is activity-logged. They do not mutate `MealRequest`, recipe ingredients, profiles or inventory. A missing-paneer report alerts the family and flags the schedule for review; it does not replace the dish.

Cook cards have no request edit, delete, cancel, replace or approval controls. Cook endpoints accept explicit strict schemas and reject meal-choice fields. They do not expose arbitrary request patches. Inventory/profile changes mark affected schedules for recheck; no choice is automatically replaced.

## API separation

Responses use `{data, error}`. `x-rasoi-household` selects the household (default `demo-household`); `x-rasoi-member` selects an active member for family/profile-specific operations. These headers deliberately provide no identity security.

| Endpoint | Method / purpose |
| --- | --- |
| `/api/households` | GET household selector |
| `/api/family/profile` | GET/PATCH selected profile preferences |
| `/api/family/meals?date=YYYY-MM-DD` | GET selected member's requests, dietary assessments and assignments |
| `/api/family/meal-requests` | POST a new dish/attendance request |
| `/api/family/meal-requests/:id` | PATCH full allowed choice payload; DELETE cancels |
| `/api/family/cook-updates?date=YYYY-MM-DD` | GET reports and suggestions for selected member's meals |
| `/api/family/suggestions/:id/review` | POST explicit ACCEPT with reviewed recipe ID, or REJECT; requires `confirmed: true` |
| `/api/admin/meal-requests` | GET family coordination assessments (legacy path) |
| `/api/admin/meal-requests/:id/status` | PATCH family review status |
| `/api/admin/meal-schedules` | GET/POST family schedule proposals |
| `/api/admin/meal-schedules/:id/approve` | POST explicit family approval |
| `/api/admin/meal-schedules/:id/withdraw` | POST family withdrawal |
| `/api/cook/requests?date=YYYY-MM-DD` | GET read-only submitted/reviewed choices |
| `/api/cook/today`, `/api/cook/schedule` | GET approved assignments |
| `/api/cook/meals/:id` | GET one approved schedule |
| `/api/cook/preparation/:dishId` | PATCH `{status}` only |
| `/api/cook/reports` | POST `{scheduleId, type, message}`; type is UNAVAILABLE_INGREDIENT or RECIPE_CORRECTION |
| `/api/cook/notes` | POST `{scheduleId, message}` |
| `/api/cook/substitutions` | POST `{requestId, ingredientFrom, ingredientTo, message}` |
| `/api/cook/preferences` | PATCH `{preferredLanguage}` only |

`/api/auth/*`, `/api/admin/accounts` and `/login` are removed. Existing recipe, inventory, member, planning, generation and dataset APIs remain. Invalid JSON returns 400; missing records 404; stale/conflicting choices 409; invalid fields 422. Cross-origin mutations are rejected as before; this is not identity authentication.

## Dataset and AI preserved

Recipe resolution priority remains preferred household custom → Mendeley → local seed → AI-generated. Original source recipes stay immutable; editable household variants preserve their provenance.

Dataset: Kanishka Jain, *Indian Food Dataset*, DOI `10.17632/xsphgmmh7b.1`, CC BY 4.0. Retain source attribution and review embedded third-party content rights before redistribution. [Dataset](https://data.mendeley.com/datasets/xsphgmmh7b/1), [CSV file](https://data.mendeley.com/datasets/xsphgmmh7b/1/files/6fb5ae32-a815-4b8f-9d68-8d512227eac8), [reference project](https://github.com/Sachinart/Indian-Recipe-API).

The existing import contains **6,865 recipes from 6,871 rows**, with six incomplete rows skipped and **15 local seed recipes** retained. Repeat-import deduplication was previously verified. The login-free upgrade does not reimport the dataset. Raw ingredient text and uncertain amounts remain preserved; no invented quantities are substituted for unknown values. Search is database-backed and household custom recipes retain priority.

Unknown dishes still offer **Generate with AI** after local retrieval. Generation uses the server-side OpenAI Responses API with structured validation, editable drafts and deterministic dietary checks. Saving requires family review/confirmation; uncertainty remains marked. Dietary failures cannot be approved by acknowledging warnings. Missing credentials, quota, model/API errors and timeouts produce clear errors. A live paid API response remains unverified when no API key is configured; provider behavior and error paths are tested with fixtures/mocks.

Vegetarian, vegan, Jain, eggetarian, fasting, allergy, no-onion/no-garlic and custom exclusions remain deterministic. Ingredient scaling and inventory/grocery calculations remain unchanged. Preparation status does not deduct stock.

## Non-destructive database changes

Migration `20261016190000_login_free_views` adds `Household.cookLanguage`, `CookSuggestion` and `HouseholdRecipeDraft`. The former one-request-per-member/date/meal unique index becomes a nonunique lookup index, permitting multiple dishes without altering existing requests.

Legacy `UserAccount`, `UserSession` and `RecipeGenerationDraft` tables remain dormant for historical preservation. No active application code reads them for authentication. The migration copies legacy drafts into household/profile-scoped storage and preserves the original rows; new drafts no longer require a user account. Existing credential files are left untouched and ignored by Git, but are no longer used. Household/member IDs and all business records remain stable. Never reset the existing database.

## Verification and limits

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:http
```

Verified on 16 October 2026: **76 tests passed**, **64 production HTTP checks passed**, TypeScript passed and the production build succeeded. The actual migration preserved all **120,892 pre-existing records across 26 tables**, checked by comparing every original column value before and after. A consistent SQLite backup was created at `prisma/backup-login-free-1792141061590.db`. The original household still has three members and 14 inventory rows; the showcase still has four members and four inventory rows.

Tests use isolated databases. Coverage includes the Phase 1/2 regressions, login-free APIs/pages, profile selection, multiple dishes, edits/cancellations, strict cook payloads, unchanged family requests after cook operations, explicit substitution confirmation, dietary rejection, stale proposals, data preservation and rendered cook controls. The HTTP script uses a separate production server and database; it requires an up-to-date build.

Browser visual/mobile interaction QA remains unverified because no browser surface is available in this session. Static rendered-control checks and live HTTP checks do not replace an interactive browser test. Future network/public use needs a deliberately designed access-control system. Voice, messaging, shopping/payment integration, automatic substitution and automatic stock deduction remain outside this prototype.
