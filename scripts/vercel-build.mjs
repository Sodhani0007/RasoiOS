import { spawnSync } from "node:child_process";
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? ""))
  throw new Error(
    "Vercel needs a hosted PostgreSQL DATABASE_URL. Local SQLite is deliberately not deployed as persistent storage.",
  );
const run = (args, env = process.env) => {
  const r = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env,
    windowsHide: true,
  });
  if (r.error || r.status !== 0)
    throw new Error(`Build step failed: ${args[0]}`);
};
run(["scripts/postgres-schema.mjs"]);
run([
  "node_modules/prisma/build/index.js",
  "generate",
  "--schema",
  "prisma/postgresql/schema.prisma",
]);
run(
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "prisma/postgresql/schema.prisma",
  ],
  {
    ...process.env,
    DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
);
run(["node_modules/next/dist/bin/next", "build"]);
