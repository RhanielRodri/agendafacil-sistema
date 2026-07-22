declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    TEST_SEED: string;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_POLICY_AUD: string;
  }
}
