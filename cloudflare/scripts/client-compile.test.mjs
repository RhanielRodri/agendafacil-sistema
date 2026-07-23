// Gate de equivalência: o módulo de configuração que o front consome é uma
// projeção fiel do Client Pack. Se o pack e o módulo versionado divergirem,
// este teste falha — é o que torna o pack a fonte de verdade sem alterar o
// runtime das verticais existentes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileFrontendConfig, compileTerminology, renderFrontendModule } from "../client-packs/compile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS = resolve(__dirname, "..", "client-packs");
const FRONT = resolve(__dirname, "..", "..", "frontend", "src", "config");

async function loadPack(slug) {
  return JSON.parse(await readFile(join(PACKS, `${slug}.json`), "utf8"));
}

async function importDefault(path) {
  const mod = await import(pathToFileURL(path).href);
  return mod.default;
}

for (const slug of ["studio-cut", "lumiere"]) {
  test(`config do front de ${slug} é projeção do pack`, async () => {
    const pack = await loadPack(slug);
    const current = await importDefault(join(FRONT, "demos", `${slug}.js`));
    assert.deepEqual(compileFrontendConfig(pack), current);
  });

  test(`terminologia de ${slug} é projeção do pack`, async () => {
    const pack = await loadPack(slug);
    const { verticalConfig } = await import(pathToFileURL(join(FRONT, "verticals.js")).href);
    assert.deepEqual(compileTerminology(pack), verticalConfig(slug));
  });

  test(`módulo renderizado de ${slug} reimporta idêntico`, async () => {
    // O texto gerado é JS válido e reconstrói o mesmo objeto de configuração.
    const pack = await loadPack(slug);
    const text = renderFrontendModule(pack);
    const dataUrl = "data:text/javascript;base64," + Buffer.from(text, "utf8").toString("base64");
    const mod = await import(dataUrl);
    assert.deepEqual(mod.default, compileFrontendConfig(pack));
  });
}
