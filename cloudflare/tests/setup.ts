import { applyD1Migrations, env } from "cloudflare:test";
import { executeSqlScript } from "./sql";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
await executeSqlScript(env.DB, env.TEST_SEED);
