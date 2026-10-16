import "dotenv/config";
import { readFileSync } from "node:fs";
import { importDataset, parseDataset } from "../src/lib/recipes/importer";
import { db } from "../src/lib/db";
async function main() {
  const file = process.argv[2] ?? "data/imports/IndianFoodDatasetCSV.csv";
  const rows = parseDataset(readFileSync(file, "utf8"));
  console.log(`Read ${rows.length} source rows from ${file}`);
  const totals = { imported: 0, duplicates: 0, skipped: 0 };
  for (let i = 0; i < rows.length; i += 100) {
    const result = await importDataset(rows.slice(i, i + 100));
    totals.imported += result.imported;
    totals.duplicates += result.duplicates;
    totals.skipped += result.skipped;
    if (result.errors.length) console.error(result.errors);
    if (i % 1000 === 0)
      console.log(`Processed ${Math.min(i + 100, rows.length)} rows`);
  }
  console.log({
    ...totals,
    verifiedDatabaseCount: await db.recipeImportRecord.count(),
  });
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
