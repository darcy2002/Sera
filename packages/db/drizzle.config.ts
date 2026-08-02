import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the repo-root .env (drizzle-kit runs from packages/db).
config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://sera:sera@localhost:5432/sera",
  },
});
