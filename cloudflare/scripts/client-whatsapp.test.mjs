// Testes do núcleo de WhatsApp manual (frontend/src/utils/whatsapp.js). Puro,
// sem React — roda em node --test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const utilPath = resolve(__dirname, "..", "..", "frontend", "src", "utils", "whatsapp.js");
const {
  normalizeWaPhone,
  renderTemplate,
  waMeUrl,
  buildWaAction,
  DEFAULT_TEMPLATES,
  TEMPLATE_KINDS,
  whatsappHistoryNote,
  hasWhatsappOptOut
} =
  await import(pathToFileURL(utilPath).href);

test("normaliza telefone para wa.me com código do país", () => {
  assert.equal(normalizeWaPhone("(27) 98888-7777"), "5527988887777");
  assert.equal(normalizeWaPhone("5527988887777"), "5527988887777");
  assert.equal(normalizeWaPhone("123"), null);
});

test("renderiza template e colapsa placeholder vazio", () => {
  const out = renderTemplate("Olá {cliente}! Seu {servico} na {negocio}.", { cliente: "Ana", servico: "corte" });
  assert.equal(out, "Olá Ana! Seu corte na.");
});

test("waMeUrl monta link com texto codificado", () => {
  const url = waMeUrl("27988887777", "Olá {cliente}!");
  assert.ok(url.startsWith("https://wa.me/5527988887777?text="));
  assert.ok(url.includes(encodeURIComponent("Olá")));
});

test("waMeUrl retorna null sem número válido", () => {
  assert.equal(waMeUrl("", "oi"), null);
});

test("buildWaAction usa pack quando fornecido, senão o padrão", () => {
  const ctx = { cliente: "Ana", negocio: "Studio Cut", servico: "corte", data: "01/08", hora: "09:00" };
  const withDefault = buildWaAction({ phone: "27988887777", kind: "confirmation", context: ctx });
  assert.ok(withDefault.message.includes("Studio Cut"));
  const custom = buildWaAction({ phone: "27988887777", kind: "confirmation", context: ctx, templates: { confirmation: "Oi {cliente}" } });
  assert.equal(custom.message, "Oi Ana");
});

test("templates padrão espelham o pack neutro (sem drift)", async () => {
  const template = JSON.parse(await readFile(resolve(__dirname, "..", "client-packs", "template.json"), "utf8"));
  assert.deepEqual(DEFAULT_TEMPLATES, template.whatsapp.templates);
  assert.deepEqual(TEMPLATE_KINDS, Object.keys(template.whatsapp.templates));
});

test("registro manual diferencia contato e opt-out persistente", () => {
  const contact = whatsappHistoryNote("contact", "confirmation");
  const optOut = whatsappHistoryNote("optOut", "confirmation");
  assert.match(contact, /contato realizado/);
  assert.equal(hasWhatsappOptOut([{ metadata: { content: contact } }]), false);
  assert.equal(hasWhatsappOptOut([{ metadata: { content: optOut } }]), true);
});
