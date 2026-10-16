import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const source = readFileSync("prisma/schema.prisma", "utf8");
mkdirSync("prisma/postgresql", { recursive: true });
writeFileSync(
  "prisma/postgresql/schema.prisma",
  "// Generated from ../schema.prisma by npm run db:postgres:prepare.\n" +
    source.replace('provider = "sqlite"', 'provider = "postgresql"'),
);
console.log(
  "PostgreSQL schema prepared; SQLite schema and database unchanged.",
);
