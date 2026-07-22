import { readFile } from "node:fs/promises";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  const seed = await readFile("seed/0001_demo.sql", "utf8");

  return {
    plugins: [
      cloudflareTest({
        main: "./public-worker/src/index.ts",
        miniflare: {
          d1Databases: ["DB"],
          bindings: {
            TEST_MIGRATIONS: migrations,
            TEST_SEED: seed,
            ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
            ACCESS_POLICY_AUD: "local-test-audience"
          }
        }
      })
    ],
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup.ts"],
      sequence: {
        concurrent: false
      }
    }
  };
});
