# Deploy RasoiOS through Vercel's website

The local application is verified. Public deployment and hosted PostgreSQL reads/writes are **not yet verified**: you chose to connect the database and deploy through Vercel yourself.

## 1. Publish the project source

Create a private GitHub repository and upload this project's source, or extract `rasoios-vercel-source.zip` and publish its contents. `package.json` must be at the repository root. The archive excludes credentials, SQLite files, migration exports, dependencies and build output. If using GitHub's website, upload the extracted source files and folders, not the zip as a single repository file.

Do not upload `.env`, `.env.local`, `demo-credentials-*.json`, `prisma/*.db`, or `data/migration/`. The migration export contains your household records and is used locally in step 3.

## 2. Connect hosted PostgreSQL

In Vercel, choose **Add New → Project**, import that repository, and select **Next.js**. Create/connect a PostgreSQL database through the Marketplace (for example Neon or Prisma Postgres), or use an existing **empty, dedicated PostgreSQL database**. Use a standard `postgresql://` or `postgres://` connection, not a `prisma://` proxy URL.

Set the following in the Vercel project's Environment Variables, for Production and any Preview deployment you intend to use:

| Name                  | Value                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | The real hosted PostgreSQL connection string; never `file:./dev.db` on Vercel                 |
| `DIRECT_URL`          | Optional direct/non-pooled PostgreSQL connection for migrations, if the provider supplies one |
| `GEMINI_API_KEY`      | Your Gemini key                                                                               |
| `GEMINI_MODEL`        | `gemini-3.1-flash-lite` (passed a real recipe request in this session)                        |
| `GROQ_API_KEY`        | Your Groq key                                                                                 |
| `GROQ_MODEL`          | `openai/gpt-oss-120b` (passed real command and fallback recipe requests)                      |
| `AI_RECIPE_PROVIDER`  | `gemini`                                                                                      |
| `AI_COMMAND_PROVIDER` | `groq`                                                                                        |
| `AI_FALLBACK_ENABLED` | `true`                                                                                        |

OpenAI is optional and was not live-tested. No secret uses a `NEXT_PUBLIC_` variable.

Set Node.js to **24.x** if Vercel asks. Keep Install Command **`npm ci`** and Build Command **`npm run build:vercel`**. `vercel.json` already supplies these commands. The build generates the PostgreSQL Prisma client, applies the committed PostgreSQL migrations, and builds Next.js. The API route allows up to 120 seconds, subject to your Vercel plan's limits.

## 3. Transfer the existing household and recipe library

Before demonstrating the hosted site, copy the hosted connection string into **local `.env.local`** as `POSTGRES_URL`. Keep the local `DATABASE_URL` unchanged:

```dotenv
DATABASE_URL="file:./dev.db"
# POSTGRES_URL must be the actual connection supplied by your database provider.
```

If supplied, also add `DIRECT_URL` locally. Then run from this project directory in PowerShell:

```powershell
npm.cmd run db:export
npm.cmd run db:migrate:postgres
npm.cmd run db:import:postgres
```

These scripts load `.env.local` before `.env`. Export reads SQLite in a consistent read transaction and writes `data/migration/sqlite-export.json`. PostgreSQL migrations do not generate or switch your local SQLite client. Import inserts all model records in dependency order in one transaction, checks each table's row count and commits only after the checks pass. **Import refuses any nonempty target RasoiOS table**; it never overwrites existing rows. A failed import rolls back. Do not run a demo seed against the hosted database before importing your existing records.

The prepared export has 120,898 model records, including 6,882 recipes. Regenerate it with `db:export` to include any local changes made after this session. The original SQLite backup is `prisma/backup-phase34-1792142147455.db`.

Do not use `prisma migrate reset`, `db push --force-reset`, or import into a populated database. If import reports existing rows, use a new empty dedicated database or review those rows before deciding on a separate merge process.

## 4. Deploy and verify the real URL

Click **Deploy** (or **Redeploy** after adding environment variables). Open the assigned Vercel URL, then:

1. Confirm your household profiles and recipe library are present. An empty database requires step 3; deployment does not seed over your data.
2. In Family View, select a profile, type a dish name, choose a dropdown result, use **Add Another Dish**, set portions and save.
3. Refresh and verify both dishes remain. Test another profile separately.
4. Use **Coordinate meals** to propose and approve a schedule. Open Cook View and change preparation status.
5. Report an unavailable ingredient, review an available alternative in Family View, confirm it, and return to Cook View. Reapprove a fresh schedule before cooking the revised choices.
6. Generate an unknown dish, review/edit the AI draft, save it and refresh. Watch for a clear provider error if quota or model access changes.
7. Check browser console/network failures and repeat persistence checks in a fresh browser tab.

Only after these checks should the public deployment and hosted persistence be called verified.

## Local operation and verification

```powershell
npm.cmd run db:generate
npm.cmd run build
npm.cmd start
```

Open `http://localhost:3000`. Use production mode for the demo; it avoids development hot-reload behavior. Your local environment remains SQLite.

```powershell
npm.cmd test
npm.cmd run test:http
npm.cmd run ai:check:providers
npm.cmd run test:browser
```

Browser tests launch real headless Chromium against a separate database and make live AI requests when configured. If Chromium is absent on another machine, install it with `npx.cmd playwright install chromium`. Screenshots and results are written to `test-results/browser/`.

The app deliberately has no login. Profile selection and Cook controls are workflow boundaries, not secure identity-based access control; anyone with the public URL can use the family APIs. This is the requested hackathon configuration.

Official references: [Vercel Next.js deployment](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Prisma migration provider limitations](https://www.prisma.io/docs/orm/v6/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues), [Groq structured outputs](https://console.groq.com/docs/structured-outputs).
