import "./env.js"; // must be first: loads .env before ./index reads DATABASE_URL

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, medicareRates } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = resolve(here, "../seed/medicare_rates.csv");

const rows = readFileSync(csvPath, "utf8")
  .trim()
  .split("\n")
  .slice(1) // drop header
  .map((line) => {
    const [code, description, rate] = line.split(",");
    return {
      code: code!.trim(),
      description: description!.trim(),
      nationalRate: Number(rate),
    };
  });

for (const row of rows) {
  await db
    .insert(medicareRates)
    .values(row)
    .onConflictDoUpdate({
      target: medicareRates.code,
      set: { nationalRate: row.nationalRate, description: row.description },
    });
}

console.log(`Seeded ${rows.length} Medicare rates.`);
process.exit(0);
