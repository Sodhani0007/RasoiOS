import nextEnv from "@next/env";
import { spawnSync } from "node:child_process";
import pg from "pg";
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!/^postgres(ql)?:\/\//.test(url || ""))
  throw new Error(
    "BLOCKED: set POSTGRES_URL in .env.local to the real hosted connection. SQLite stays unchanged.",
  );
const connection = process.env.DIRECT_URL || url;
const client = new pg.Client({
  connectionString: connection,
  connectionTimeoutMillis: 15000,
});
try {
  await client.connect();
  const tables = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );
  if (
    tables.rows.length &&
    !tables.rows.some((t) => t.tablename === "_prisma_migrations")
  )
    throw new Error(
      "Target already contains tables without Prisma migration history. Use an empty dedicated database or review an explicit baseline; no schema was changed.",
    );
} catch (e) {
  console.error(
    e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[redacted database URL]"),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
if (!process.exitCode) {
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "prisma/postgresql/schema.prisma",
    ],
    {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: connection },
      windowsHide: true,
      encoding: "utf8",
    },
  );
  if (r.status !== 0) {
    console.error(
      (r.stderr || r.stdout || "Migration failed").replace(
        /postgres(?:ql)?:\/\/[^\s]+/g,
        "[redacted database URL]",
      ),
    );
    process.exitCode = 1;
  } else
    console.log(
      "PostgreSQL migrations applied. Local SQLite configuration and Prisma client were preserved.",
    );
}
