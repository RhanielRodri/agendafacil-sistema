import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { planWranglerConfigs, renderWranglerConfig } from "./client.mjs";

const pack = { tenant: { slug: "fixture-neutra" } };

test("config Wrangler contém tenant, D1, assets e Access seguro", () => {
  const publicConfig = JSON.parse(renderWranglerConfig(pack, "local", "public"));
  const adminConfig = JSON.parse(renderWranglerConfig(pack, "local", "admin"));
  assert.equal(publicConfig.vars.TENANT_SLUG, "fixture-neutra");
  assert.equal(publicConfig.d1_databases[0].binding, "DB");
  assert.equal(publicConfig.assets.directory, "./dist/fixture-neutra/public");
  assert.equal(adminConfig.assets.directory, "./dist/fixture-neutra/admin");
  assert.equal(adminConfig.vars.ACCESS_TEAM_DOMAIN, "not-configured.invalid");
  assert.equal(adminConfig.vars.ACCESS_POLICY_AUD, "not-configured");
});

test("provision Wrangler é dry-run por padrão e idempotente no apply", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agendafacil-provision-"));
  try {
    const dryRun = await planWranglerConfigs(pack, "local", false, dir);
    assert.ok(dryRun.every((item) => !item.written && !item.exists));
    const applied = await planWranglerConfigs(pack, "local", true, dir);
    assert.ok(applied.every((item) => item.written));
    const repeated = await planWranglerConfigs(pack, "local", true, dir);
    assert.ok(repeated.every((item) => item.unchanged && !item.written));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("provision recusa sobrescrever config conflitante", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agendafacil-conflict-"));
  try {
    await planWranglerConfigs(pack, "local", true, dir);
    const publicPath = join(dir, "wrangler.local.fixture-neutra.public.jsonc");
    await writeFile(publicPath, "{\"name\":\"outro-worker\"}\n", "utf8");
    await assert.rejects(() => planWranglerConfigs(pack, "local", true, dir), /conflito de config Wrangler/);
    assert.equal(await readFile(publicPath, "utf8"), "{\"name\":\"outro-worker\"}\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("provision aceita config remota compatível com IDs reais", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agendafacil-remote-"));
  try {
    for (const surface of ["public", "admin"]) {
      const config = JSON.parse(renderWranglerConfig(pack, "staging", surface));
      config.d1_databases[0].database_name = "agendafacil-staging-db";
      config.d1_databases[0].database_id = "real-staging-id";
      if (surface === "admin") {
        config.vars.ACCESS_TEAM_DOMAIN = "empresa.cloudflareaccess.com";
        config.vars.ACCESS_POLICY_AUD = "real-audience";
      }
      await writeFile(join(dir, `wrangler.staging.fixture-neutra.${surface}.jsonc`), `${JSON.stringify(config, null, 2)}\n`, "utf8");
    }
    const planned = await planWranglerConfigs(pack, "staging", false, dir);
    assert.ok(planned.every((item) => item.unchanged && !item.conflict));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
