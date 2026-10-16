# Phase 3 + Phase 4 verification report

Verified locally on Windows, 16 October 2026. No public Vercel URL exists in this session. Hosted PostgreSQL access remains deferred to your Vercel setup.

| Feature                     | Implemented | Real Browser Tested         | Live API Tested               | Notes                                                                                                                         |
| --------------------------- | ----------- | --------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Family View                 | Yes         | Passed                      | Local server passed           | Profile separation, save, edit, cancel, refresh persistence                                                                   |
| Autocomplete                | Yes         | Passed                      | Local search passed           | 250 ms debounce, up to 8 results, mouse and arrow/Enter selection, loading/empty states                                       |
| Multiple dishes per meal    | Yes         | Passed                      | Local server passed           | One atomic batch, individual portions, existing requests preserved                                                            |
| Cook View                   | Yes         | Passed                      | Local server passed           | Consolidated approved schedule, portions, ingredients, progress persistence; no family edit controls                          |
| Ingredient shortage         | Yes         | Passed                      | Local server passed           | Explicit stock confirmation, stored report, affected choices only, inventory audit event                                      |
| Family replacement approval | Yes         | Passed                      | Local server passed           | Deterministic diet/stock/meal checks; unrelated dish choices remain; revised schedule needs approval                          |
| Gemini                      | Yes         | Requested in browser        | Passed                        | Direct validated recipe with `gemini-3.1-flash-lite`; latest full browser run used Groq fallback after Gemini failure         |
| Groq                        | Yes         | Passed                      | Passed                        | `openai/gpt-oss-120b`; real Hinglish command and fallback recipe                                                              |
| Unknown recipe review/save  | Yes         | Passed                      | Passed                        | Real provider draft, editing/rechecking, reviewed save, meal save and refresh; source remains AI_GENERATED                    |
| Provider reliability        | Yes         | Passed                      | Success/fallback exercised    | 35-second request timeout, one fallback, Zod validation, clear errors; missing keys and invalid output also tested with mocks |
| Tutorial support            | Yes         | Passed                      | Not applicable                | YouTube search URL and new-tab target verified; no YouTube API used                                                           |
| PostgreSQL preparation      | Yes         | Not yet                     | Blocked by missing hosted URL | Generated schema, initial SQL migration, client generation/typecheck, safe export/import scripts                              |
| SQLite data preservation    | Yes         | Passed on isolated database | Local reads passed            | Existing database backed up, additive migration, 6,882 recipes retained; tests do not change user meal choices                |
| Vercel deployment           | Prepared    | Not yet                     | Not yet                       | User will deploy through website; exact instructions in DEPLOYMENT.md                                                         |

## Check results

- **82 Vitest tests passed** across seven files, including six new batch/shortage/provider tests.
- **64 live HTTP checks passed** against an isolated database with AI intentionally disabled.
- **13 real Chromium browser checks passed**, including live Groq interpretation and real unknown-recipe generation through the fallback service.
- **Production build passed**. TypeScript also passed against both SQLite and PostgreSQL generated Prisma clients; the local SQLite client was restored.
- Direct provider checks: **Gemini recipe PASS**, **Groq command PASS**, both Zod validated. Earlier retired/inaccessible models and Gemini high-demand errors were observed and handled; neither was reported as a pass.
- Additional read-only Chromium checks against the original database returned 8 live Mendeley suggestions, verified view switching and found no horizontal overflow at 390 px. Original records remain 6,882 recipes, 7 members and 3 meal requests.
- No uncaught browser errors or failed transport requests during successful flows. A separate simulated 503 response verified the displayed error and manual-report fallback.
- PostgreSQL import has **not** been executed against a real hosted database. Count verification exists in the script but is not evidence of hosted persistence until run.

Evidence: `test-results/browser/report.json`, `test-results/browser/family-multiple-dishes.png`, `test-results/browser/cook-after-approval.png`. These local artifacts are excluded from deployment source.

## Reliable demo sequence

1. Select a non-fasting profile whose restrictions permit the dishes. Add **Dal Tadka**, **Jeera Rice** and **Roti**, adjusting portions. Show a second profile choosing **Paneer Bhurji**. A Jain profile must retain its restrictions; use verified Jain-compatible dishes instead of overriding them for the demo.
2. Use **Coordinate meals**, create a proposal, review dietary and ingredient checks, and approve the schedule. Open Cook View and mark a dish cooking.
3. Report paneer unavailable. Show the affected request and preserved rice/dal choices. Confirm stock explicitly; AI interpretation alone changes nothing.
4. Switch to the affected family profile, review a known alternative, tick confirmation and approve. If actual pantry stock cannot support an alternative, the UI says so; update real stock details or keep the original request rather than claiming availability.
5. Return to Cook View to see the new choice. Recreate and approve its schedule before preparation.
6. Search for an absent dish such as **Sunday Cumin Rice**, generate a draft, review ingredients/instructions, recheck edits and save. AI output is still labeled AI-generated. The server can fall back once if the preferred provider fails.
7. Open **Watch Tutorial** to search YouTube in the selected language.

## Implementation notes

Existing MealRequest rows remain the per-dish records. `POST /api/family/meal-selections` saves up to 12 dishes atomically with shared date/type/time/notes. No destructive item-model conversion was needed.

`POST /api/cook/interpret` returns structured data and provider metadata only. `POST /api/cook/shortages` requires `confirmed: true`, updates stock availability, persists the report and creates pending family suggestions. Alternatives are checked individually for the requested portions; combined stock is checked again when the family coordinates the revised schedule. The cook never automatically replaces meal choices.

Gemini and Groq use JSON output plus strict Zod validation. Preparation/cooking steps and cuisine are retained in the saved description/instructions without changing the existing Recipe schema. Existing optional OpenAI integration is retained but not live-verified.

Local SQLite and hosted PostgreSQL use separate migration histories. Never apply SQLite migration SQL to PostgreSQL. Follow DEPLOYMENT.md for the safe sequence.
