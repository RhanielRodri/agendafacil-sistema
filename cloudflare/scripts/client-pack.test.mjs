// Testes do contrato do Client Pack. Rodam com `node --test`, sem dependências.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePack, isPublishable, PACK_VERSION } from "../client-packs/schema.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS = resolve(__dirname, "..", "client-packs");

async function loadReal(slug) {
  return JSON.parse(await readFile(join(PACKS, `${slug}.json`), "utf8"));
}

function clone(pack) {
  return JSON.parse(JSON.stringify(pack));
}

// Um erro cujo `path` bate com o prefixo informado.
function hasError(result, pathPrefix) {
  return result.errors.some((e) => e.path.startsWith(pathPrefix));
}

test("packs reais validam", async () => {
  for (const slug of ["studio-cut", "lumiere"]) {
    const result = validatePack(await loadReal(slug));
    assert.equal(result.ok, true, `${slug}: ${JSON.stringify(result.errors)}`);
    assert.equal(isPublishable(await loadReal(slug)), true);
  }
});

test("template e fixture validam mas não são publicáveis", async () => {
  for (const slug of ["template", "fixture-neutra"]) {
    const pack = await loadReal(slug);
    const result = validatePack(pack);
    assert.equal(result.ok, true, `${slug}: ${JSON.stringify(result.errors)}`);
    assert.equal(isPublishable(pack), false);
  }
});

test("PACK_VERSION divergente reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.packVersion = PACK_VERSION + 1;
  const result = validatePack(pack);
  assert.equal(result.ok, false);
  assert.ok(hasError(result, "packVersion"));
});

test("campo desconhecido reprova (fail-closed)", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.tenant.extra = "x";
  const result = validatePack(pack);
  assert.equal(result.ok, false);
  assert.ok(hasError(result, "tenant.extra"));
});

test("slug inválido reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.tenant.slug = "Studio Cut!";
  assert.equal(validatePack(pack).ok, false);
});

test("URL não-https reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.metadata.image = "http://exemplo.com/x.jpg";
  const result = validatePack(pack);
  assert.equal(result.ok, false);
  assert.ok(hasError(result, "metadata.image"));
});

test("cor não-hex reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.identity.logo.background = "black";
  assert.equal(validatePack(pack).ok, false);
});

test("segredo em string reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.content.footer.tagline = "api_key=abc123";
  const result = validatePack(pack);
  assert.equal(result.ok, false);
  assert.ok(hasError(result, "content.footer.tagline"));
});

test("HTML arbitrário reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.content.hero.sub = "Olá <script>alert(1)</script>";
  assert.equal(validatePack(pack).ok, false);
});

test("CSS arbitrário reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.content.hero.sub = "body { color: red; background: blue; }";
  assert.equal(validatePack(pack).ok, false);
});

test("associação para serviço inexistente reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.catalog.associations[0].serviceId = "service-nao-existe";
  const result = validatePack(pack);
  assert.equal(result.ok, false);
  assert.ok(hasError(result, "catalog.associations[0].serviceId"));
});

test("id de serviço duplicado reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.catalog.services[1].id = pack.catalog.services[0].id;
  assert.equal(validatePack(pack).ok, false);
});

test("business hours sem os 7 dias reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.schedule.businessHours.pop();
  const result = validatePack(pack);
  assert.equal(result.ok, false);
  assert.ok(hasError(result, "schedule.businessHours"));
});

test("bloqueio integral com horário reprova", async () => {
  const pack = clone(await loadReal("lumiere"));
  pack.schedule.scheduleBlocks[0].startTime = "10:00";
  assert.equal(validatePack(pack).ok, false);
});

test("placeholder desconhecido em template de whatsapp reprova", async () => {
  const pack = clone(await loadReal("studio-cut"));
  pack.whatsapp.templates.confirmation = "Olá {cliente}, seu {codigo_secreto} chegou";
  const result = validatePack(pack);
  assert.equal(result.ok, false);
  assert.ok(hasError(result, "whatsapp.templates.confirmation"));
});
