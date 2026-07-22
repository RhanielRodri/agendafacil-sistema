import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationHostnames,
  isExactEmailPolicy,
  parseEnv,
  run,
  updateEnvText
} from "./configure-access.mjs";

test("parseEnv preserva somente pares válidos", () => {
  assert.deepEqual(parseEnv("A=1\nB='dois'\n# C=3\n"), { A: "1", B: "dois" });
});

test("applicationHostnames normaliza domínios sem duplicar", () => {
  assert.deepEqual(applicationHostnames({
    domain: "Admin.Example.com/path",
    destinations: [{ uri: "https://admin.example.com" }]
  }), ["admin.example.com"]);
});

test("isExactEmailPolicy aceita somente allow individual", () => {
  assert.equal(isExactEmailPolicy({
    name: "Allow configured admin email",
    decision: "allow",
    precedence: 1,
    include: [{ email: { email: "admin@example.com" } }],
    exclude: [],
    require: []
  }, "ADMIN@example.com"), true);
});

test("isExactEmailPolicy rejeita regra everyone", () => {
  assert.equal(isExactEmailPolicy({
    name: "Allow configured admin email",
    decision: "allow",
    precedence: 1,
    include: [{ everyone: {} }]
  }, "admin@example.com"), false);
});

test("updateEnvText atualiza chaves sem remover o restante", () => {
  assert.equal(updateEnvText("A=1\nAUD=old\n", { AUD: "new", TEAM: "domain" }), "A=1\nAUD=new\nTEAM=domain\n");
});

test("run falha fechado quando team domain local diverge da organização", async () => {
  const api = {
    request: async () => ({ success: true, result: { auth_domain: "remote.cloudflareaccess.com" } })
  };
  await assert.rejects(run({
    check: true,
    api,
    environment: {
      CLOUDFLARE_ACCESS_API_TOKEN: "token-for-test",
      CLOUDFLARE_ACCOUNT_ID: "account-for-test",
      STUDIO_CUT_ADMIN_EMAIL: "studio@example.com",
      LUMIERE_ADMIN_EMAIL: "lumiere@example.com",
      ACCESS_TEAM_DOMAIN: "local.cloudflareaccess.com"
    }
  }), /diverge/);
});
