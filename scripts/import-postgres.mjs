import nextEnv from "@next/env";
import pg from "pg";
import { readFileSync } from "node:fs";
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!/^postgres(ql)?:\/\//.test(url ?? ""))
  throw new Error(
    "BLOCKED: provide POSTGRES_URL for a hosted PostgreSQL database; no data was changed.",
  );
const file = process.argv[2] || "data/migration/sqlite-export.json";
const data = JSON.parse(readFileSync(file, "utf8"));
if (data.version !== 1 || !Array.isArray(data.tables))
  throw new Error("Invalid migration export");
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 15000,
});
try {
  await client.connect();
  await client.query("BEGIN");
  // Refuse overwrites. A retry after a completed import is deliberately a no-op error.
  for (const table of data.tables) {
    const count = await client.query(
      `SELECT count(*) AS n FROM ${quote(table.name)}`,
    );
    if (Number(count.rows[0].n))
      throw new Error(
        `Target ${table.name} is not empty. Existing data was preserved; import refused.`,
      );
  }
  for (const table of data.tables) {
    for (let start = 0; start < table.rows.length; start += 250) {
      const rows = table.rows.slice(start, start + 250),
        values = [];
      const groups = rows.map(
        (row) =>
          "(" +
          table.columns
            .map((c) => {
              const value = row[c.name];
              values.push(
                c.type === "Json" && value !== null
                  ? JSON.stringify(value)
                  : value,
              );
              return "$" + values.length + (c.type === "Json" ? "::jsonb" : "");
            })
            .join(",") +
          ")",
      );
      await client.query(
        `INSERT INTO ${quote(table.name)} (${table.columns.map((c) => quote(c.name)).join(",")}) VALUES ${groups.join(",")}`,
        values,
      );
    }
    const actual = await client.query(
      `SELECT count(*) AS n FROM ${quote(table.name)}`,
    );
    if (Number(actual.rows[0].n) !== table.rows.length)
      throw new Error(`Verification failed for ${table.name}`);
    console.log(
      `${table.name}: ${table.rows.length} records copied and count verified`,
    );
  }
  await client.query("COMMIT");
  console.log("PostgreSQL import committed. Source SQLite was not modified.");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  // Never print connection strings or pg connection configuration.
  console.error(
    e instanceof Error
      ? e.message.replace(
          /postgres(?:ql)?:\/\/[^\s]+/g,
          "[redacted database URL]",
        )
      : "Import failed",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
