import "dotenv/config";
import { openSync, closeSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";

// Prisma's Windows schema engine can fail without diagnostics for an absent
// SQLite file. An empty file is a valid SQLite starting point. Never truncate it.
const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:"))
  throw new Error("DATABASE_URL must be a SQLite file URL");
const file = resolve("prisma", url.slice(5));
mkdirSync(dirname(file), { recursive: true });
try {
  closeSync(openSync(file, "wx"));
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
