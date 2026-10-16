import nextEnv from "@next/env";
import { DatabaseSync } from "node:sqlite";
import { Prisma } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
nextEnv.loadEnvConfig(process.cwd());
const url = process.env.SQLITE_DATABASE_URL || process.env.DATABASE_URL;
if (!url?.startsWith("file:"))
  throw new Error("Set SQLITE_DATABASE_URL to the existing SQLite file URL");
const database = new DatabaseSync(resolve("prisma", url.slice(5)), {
  readOnly: true,
});
database.exec("BEGIN");
const models = Prisma.dmmf.datamodel.models;
const ordered = [],
  remaining = [...models];
while (remaining.length) {
  const index = remaining.findIndex((m) =>
    m.fields
      .filter((f) => f.kind === "object" && f.relationFromFields?.length)
      .every((f) => ordered.some((done) => done.name === f.type)),
  );
  if (index < 0)
    throw new Error("Cyclic foreign keys require a reviewed import order");
  ordered.push(remaining.splice(index, 1)[0]);
}
const tables = ordered.map((model) => {
  const fields = model.fields.filter((f) => f.kind !== "object");
  const rows = database
    .prepare(`SELECT * FROM "${model.name}" ORDER BY rowid`)
    .all()
    .map((row) =>
      Object.fromEntries(
        fields.map((f) => {
          let value = row[f.name];
          if (value != null) {
            if (f.type === "Json") value = JSON.parse(String(value));
            if (f.type === "Boolean") value = Boolean(value);
            if (f.type === "DateTime")
              value = new Date(
                typeof value === "bigint" ? Number(value) : value,
              ).toISOString();
          }
          return [f.name, value];
        }),
      ),
    );
  return {
    name: model.name,
    columns: fields.map((f) => ({ name: f.name, type: f.type })),
    rows,
  };
});
database.exec("COMMIT");
database.close();
mkdirSync("data/migration", { recursive: true });
const file = resolve("data/migration/sqlite-export.json");
const payload = JSON.stringify({
  version: 1,
  exportedAt: new Date().toISOString(),
  tables,
});
writeFileSync(file, payload);
console.log(
  JSON.stringify({
    file,
    records: tables.reduce((n, t) => n + t.rows.length, 0),
    sha256: createHash("sha256").update(payload).digest("hex"),
  }),
);
