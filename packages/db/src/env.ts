import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load the repo-root .env before the db client reads DATABASE_URL.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../.env") });
