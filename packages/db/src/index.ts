import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// A single shared postgres.js client. Reused across the process.
const client = postgres(connectionString);

export const db = drizzle(client, { schema });

export * from "./schema.js";
export { schema };
