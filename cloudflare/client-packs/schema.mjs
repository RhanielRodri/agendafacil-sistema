// Contrato do Client Pack. Sem dependências: um pack é o artefato versionado que
// descreve identidade, conteúdo público, terminologia, catálogo, agenda e
// configurações de UMA operação. Este módulo valida a forma e recusa por
// padrão (fail-closed): campo desconhecido, segredo, HTML/CSS arbitrário, URL
// insegura ou referência quebrada invalidam o pack inteiro.

export const PACK_VERSION = 1;

const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Placeholders permitidos nos templates de WhatsApp. Qualquer outro `{...}` é
// tratado como conteúdo desconhecido e reprovado.
const WA_PLACEHOLDERS = new Set(["cliente", "negocio", "servico", "data", "hora", "profissional"]);

// Marcadores que nunca podem viver num pack versionado. Segredos ficam em `.env`
// local ou no painel do provedor; AUD/identidades do Access são resolvidos pelo
// tooling de provisionamento, nunca declarados aqui.
const SECRET_MARKERS = [
  "secret", "password", "passwd", "api_key", "apikey", "bearer ",
  "authorization:", "cf-access", "-----begin", "aud=", "aud:", "access-jwt"
];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Ctx {
  constructor() {
    this.errors = [];
  }
  err(path, message) {
    this.errors.push({ path, message });
    return false;
  }
  // Recusa qualquer chave fora do conjunto declarado.
  known(path, obj, allowed) {
    if (!isPlainObject(obj)) return this.err(path, "objeto esperado");
    let ok = true;
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) ok = this.err(`${path}.${key}`, "campo desconhecido");
    }
    return ok;
  }
  str(path, value, { min = 1, max = 4000 } = {}) {
    if (typeof value !== "string") return this.err(path, "string esperada");
    if (value.length < min) return this.err(path, "string vazia não permitida");
    if (value.length > max) return this.err(path, "string acima do limite");
    return this.noSecret(path, value) && this.noMarkup(path, value);
  }
  noSecret(path, value) {
    const low = value.toLowerCase();
    for (const marker of SECRET_MARKERS) {
      if (low.includes(marker)) return this.err(path, `possível segredo/credencial ("${marker}")`);
    }
    return true;
  }
  noMarkup(path, value) {
    if (/<\/?[a-z][\s\S]*>/i.test(value)) return this.err(path, "HTML não permitido");
    // CSS arbitrário: um bloco { … : … ; … }. Placeholders {cliente} não têm `:`.
    if (/\{[^}]*:[^}]*;[^}]*\}/.test(value)) return this.err(path, "CSS não permitido");
    return true;
  }
  bool(path, value) {
    if (typeof value !== "boolean") return this.err(path, "booleano esperado");
    return true;
  }
  int(path, value, { min = -Infinity, max = Infinity } = {}) {
    if (!Number.isInteger(value)) return this.err(path, "inteiro esperado");
    if (value < min || value > max) return this.err(path, `fora do intervalo [${min}, ${max}]`);
    return true;
  }
  hex(path, value) {
    if (typeof value !== "string" || !HEX.test(value)) return this.err(path, "cor hex #rrggbb esperada");
    return true;
  }
  httpsUrl(path, value) {
    if (typeof value !== "string") return this.err(path, "URL esperada");
    let url;
    try {
      url = new URL(value);
    } catch {
      return this.err(path, "URL inválida");
    }
    if (url.protocol !== "https:") return this.err(path, "somente https");
    return this.noSecret(path, value);
  }
  // Foto aceita caminho relativo servido pelos assets ou https.
  asset(path, value) {
    if (typeof value !== "string" || value.length === 0) return this.err(path, "caminho esperado");
    if (value.startsWith("/")) return this.noSecret(path, value);
    return this.httpsUrl(path, value);
  }
  strArray(path, value, opts) {
    if (!Array.isArray(value) || value.length === 0) return this.err(path, "lista não vazia esperada");
    let ok = true;
    value.forEach((item, i) => {
      if (!this.str(`${path}[${i}]`, item, opts)) ok = false;
    });
    return ok;
  }
}

function validateLogo(c, logo) {
  c.known("identity.logo", logo, ["mark", "background", "foreground"]);
  c.str("identity.logo.mark", logo?.mark, { max: 4 });
  c.hex("identity.logo.background", logo?.background);
  c.hex("identity.logo.foreground", logo?.foreground);
}

function validateContent(c, content) {
  if (!c.known("content", content, ["hero", "details", "process", "space", "copy", "footer"])) return;
  const hero = content.hero;
  if (c.known("content.hero", hero, ["eyebrow", "headline", "sub", "primaryCta", "secondaryCta", "highlights", "image", "imageAlt", "badge"])) {
    c.str("content.hero.eyebrow", hero.eyebrow);
    c.strArray("content.hero.headline", hero.headline, { max: 40 });
    c.str("content.hero.sub", hero.sub);
    c.str("content.hero.primaryCta", hero.primaryCta, { max: 60 });
    c.str("content.hero.secondaryCta", hero.secondaryCta, { max: 60 });
    c.strArray("content.hero.highlights", hero.highlights);
    c.asset("content.hero.image", hero.image);
    c.str("content.hero.imageAlt", hero.imageAlt);
    c.str("content.hero.badge", hero.badge);
  }
  for (const key of ["details", "process"]) {
    const block = content[key];
    if (!c.known(`content.${key}`, block, ["eyebrow", "title", "items"])) continue;
    c.str(`content.${key}.eyebrow`, block.eyebrow);
    c.str(`content.${key}.title`, block.title);
    if (!Array.isArray(block.items) || block.items.length === 0) {
      c.err(`content.${key}.items`, "lista não vazia esperada");
      continue;
    }
    block.items.forEach((item, i) => {
      const allowed = key === "process" ? ["number", "title", "text"] : ["title", "text"];
      if (!c.known(`content.${key}.items[${i}]`, item, allowed)) return;
      if (key === "process") c.str(`content.${key}.items[${i}].number`, item.number, { max: 8 });
      c.str(`content.${key}.items[${i}].title`, item.title);
      c.str(`content.${key}.items[${i}].text`, item.text);
    });
  }
  const space = content.space;
  if (c.known("content.space", space, ["eyebrow", "title", "description", "image", "imageAlt"])) {
    c.str("content.space.eyebrow", space.eyebrow);
    c.str("content.space.title", space.title);
    c.strArray("content.space.description", space.description);
    c.asset("content.space.image", space.image);
    c.str("content.space.imageAlt", space.imageAlt);
  }
  const copy = content.copy;
  if (c.known("content.copy", copy, ["servicesEyebrow", "servicesTitle", "professionalsEyebrow", "professionalsTitle"])) {
    c.str("content.copy.servicesEyebrow", copy.servicesEyebrow);
    c.str("content.copy.servicesTitle", copy.servicesTitle);
    c.str("content.copy.professionalsEyebrow", copy.professionalsEyebrow);
    c.str("content.copy.professionalsTitle", copy.professionalsTitle);
  }
  if (c.known("content.footer", content.footer, ["tagline"])) {
    c.str("content.footer.tagline", content.footer.tagline);
  }
}

function validateTerminology(c, term) {
  const allowed = ["dayTitle", "waitingSource", "waitingLabel", "waitingHint", "showOccupancy",
    "serviceNoun", "servicePlural", "professionalNoun", "professionalPlural", "showEvaluationFlag",
    "metricHighlights", "attentionOrder", "leadShortcuts"];
  if (!c.known("terminology", term, allowed)) return;
  c.str("terminology.dayTitle", term.dayTitle);
  if (term.waitingSource !== null) c.str("terminology.waitingSource", term.waitingSource, { max: 40 });
  c.str("terminology.waitingLabel", term.waitingLabel);
  c.str("terminology.waitingHint", term.waitingHint);
  c.bool("terminology.showOccupancy", term.showOccupancy);
  c.str("terminology.serviceNoun", term.serviceNoun, { max: 40 });
  c.str("terminology.servicePlural", term.servicePlural, { max: 40 });
  c.str("terminology.professionalNoun", term.professionalNoun, { max: 40 });
  c.str("terminology.professionalPlural", term.professionalPlural, { max: 40 });
  c.bool("terminology.showEvaluationFlag", term.showEvaluationFlag);
  c.strArray("terminology.metricHighlights", term.metricHighlights, { max: 60 });
  c.strArray("terminology.attentionOrder", term.attentionOrder, { max: 60 });
  if (!Array.isArray(term.leadShortcuts) || term.leadShortcuts.length === 0) {
    c.err("terminology.leadShortcuts", "lista não vazia esperada");
    return;
  }
  term.leadShortcuts.forEach((s, i) => {
    if (!c.known(`terminology.leadShortcuts[${i}]`, s, ["id", "label", "filters"])) return;
    c.str(`terminology.leadShortcuts[${i}].id`, s.id, { max: 40 });
    c.str(`terminology.leadShortcuts[${i}].label`, s.label, { max: 60 });
    if (!isPlainObject(s.filters)) c.err(`terminology.leadShortcuts[${i}].filters`, "objeto esperado");
  });
}

function validateSettings(c, s) {
  const allowed = ["publicName", "timezone", "slotDurationMinutes", "minAdvanceMinutes",
    "maxFutureDays", "cancellationPolicy", "confirmationMessage", "bookingEnabled"];
  if (!c.known("settings", s, allowed)) return;
  c.str("settings.publicName", s.publicName, { max: 120 });
  c.str("settings.timezone", s.timezone, { max: 60 });
  c.int("settings.slotDurationMinutes", s.slotDurationMinutes, { min: 5, max: 480 });
  c.int("settings.minAdvanceMinutes", s.minAdvanceMinutes, { min: 0, max: 100000 });
  c.int("settings.maxFutureDays", s.maxFutureDays, { min: 1, max: 3650 });
  c.str("settings.cancellationPolicy", s.cancellationPolicy);
  c.str("settings.confirmationMessage", s.confirmationMessage);
  c.bool("settings.bookingEnabled", s.bookingEnabled);
}

function validateCatalog(c, catalog) {
  if (!c.known("catalog", catalog, ["services", "professionals", "associations"])) return;
  const serviceIds = new Set();
  const professionalIds = new Set();
  if (!Array.isArray(catalog.services) || catalog.services.length === 0) {
    c.err("catalog.services", "lista não vazia esperada");
  } else {
    catalog.services.forEach((svc, i) => {
      const p = `catalog.services[${i}]`;
      if (!c.known(p, svc, ["id", "name", "description", "durationMinutes", "priceCents", "active", "displayOrder", "requiresEvaluation"])) return;
      if (typeof svc.id === "string") {
        if (serviceIds.has(svc.id)) c.err(`${p}.id`, "id duplicado");
        serviceIds.add(svc.id);
      }
      c.str(`${p}.id`, svc.id, { max: 80 });
      c.str(`${p}.name`, svc.name, { max: 120 });
      c.str(`${p}.description`, svc.description);
      c.int(`${p}.durationMinutes`, svc.durationMinutes, { min: 5, max: 600 });
      c.int(`${p}.priceCents`, svc.priceCents, { min: 0, max: 100000000 });
      c.bool(`${p}.active`, svc.active);
      c.int(`${p}.displayOrder`, svc.displayOrder, { min: 0, max: 9999 });
      c.bool(`${p}.requiresEvaluation`, svc.requiresEvaluation);
    });
  }
  if (!Array.isArray(catalog.professionals) || catalog.professionals.length === 0) {
    c.err("catalog.professionals", "lista não vazia esperada");
  } else {
    catalog.professionals.forEach((pro, i) => {
      const p = `catalog.professionals[${i}]`;
      if (!c.known(p, pro, ["id", "name", "specialty", "photo", "active", "displayOrder"])) return;
      if (typeof pro.id === "string") {
        if (professionalIds.has(pro.id)) c.err(`${p}.id`, "id duplicado");
        professionalIds.add(pro.id);
      }
      c.str(`${p}.id`, pro.id, { max: 80 });
      c.str(`${p}.name`, pro.name, { max: 120 });
      c.str(`${p}.specialty`, pro.specialty, { max: 120 });
      c.asset(`${p}.photo`, pro.photo);
      c.bool(`${p}.active`, pro.active);
      c.int(`${p}.displayOrder`, pro.displayOrder, { min: 0, max: 9999 });
    });
  }
  if (!Array.isArray(catalog.associations)) {
    c.err("catalog.associations", "lista esperada");
  } else {
    const seen = new Set();
    catalog.associations.forEach((a, i) => {
      const p = `catalog.associations[${i}]`;
      if (!c.known(p, a, ["professionalId", "serviceId"])) return;
      c.str(`${p}.professionalId`, a.professionalId, { max: 80 });
      c.str(`${p}.serviceId`, a.serviceId, { max: 80 });
      if (!professionalIds.has(a.professionalId)) c.err(`${p}.professionalId`, "profissional inexistente");
      if (!serviceIds.has(a.serviceId)) c.err(`${p}.serviceId`, "serviço inexistente");
      const key = `${a.professionalId}::${a.serviceId}`;
      if (seen.has(key)) c.err(p, "associação duplicada");
      seen.add(key);
    });
  }
  return { serviceIds, professionalIds };
}

function validateSchedule(c, schedule, professionalIds) {
  if (!c.known("schedule", schedule, ["businessHours", "professionalSchedules", "scheduleBlocks"])) return;
  const days = new Set();
  if (!Array.isArray(schedule.businessHours) || schedule.businessHours.length !== 7) {
    c.err("schedule.businessHours", "7 dias (0-6) esperados");
  } else {
    schedule.businessHours.forEach((h, i) => {
      const p = `schedule.businessHours[${i}]`;
      if (!c.known(p, h, ["dayOfWeek", "openTime", "closeTime", "isOpen"])) return;
      if (c.int(`${p}.dayOfWeek`, h.dayOfWeek, { min: 0, max: 6 })) {
        if (days.has(h.dayOfWeek)) c.err(`${p}.dayOfWeek`, "dia duplicado");
        days.add(h.dayOfWeek);
      }
      if (typeof h.openTime !== "string" || !TIME.test(h.openTime)) c.err(`${p}.openTime`, "HH:MM esperado");
      if (typeof h.closeTime !== "string" || !TIME.test(h.closeTime)) c.err(`${p}.closeTime`, "HH:MM esperado");
      c.bool(`${p}.isOpen`, h.isOpen);
    });
  }
  const idsSeen = new Set();
  (schedule.professionalSchedules || []).forEach((s, i) => {
    const p = `schedule.professionalSchedules[${i}]`;
    if (!c.known(p, s, ["id", "professionalId", "dayOfWeek", "startTime", "endTime", "active"])) return;
    c.str(`${p}.id`, s.id, { max: 80 });
    if (idsSeen.has(s.id)) c.err(`${p}.id`, "id duplicado");
    idsSeen.add(s.id);
    if (!professionalIds?.has(s.professionalId)) c.err(`${p}.professionalId`, "profissional inexistente");
    c.int(`${p}.dayOfWeek`, s.dayOfWeek, { min: 0, max: 6 });
    if (typeof s.startTime !== "string" || !TIME.test(s.startTime)) c.err(`${p}.startTime`, "HH:MM esperado");
    if (typeof s.endTime !== "string" || !TIME.test(s.endTime)) c.err(`${p}.endTime`, "HH:MM esperado");
    c.bool(`${p}.active`, s.active);
  });
  if (!Array.isArray(schedule.professionalSchedules)) c.err("schedule.professionalSchedules", "lista esperada");
  const blockIds = new Set();
  (schedule.scheduleBlocks || []).forEach((b, i) => {
    const p = `schedule.scheduleBlocks[${i}]`;
    if (!c.known(p, b, ["id", "professionalId", "date", "allDay", "startTime", "endTime", "reason"])) return;
    c.str(`${p}.id`, b.id, { max: 80 });
    if (blockIds.has(b.id)) c.err(`${p}.id`, "id duplicado");
    blockIds.add(b.id);
    if (b.professionalId !== null && !professionalIds?.has(b.professionalId)) c.err(`${p}.professionalId`, "profissional inexistente");
    if (typeof b.date !== "string" || !ISO_DATE.test(b.date)) c.err(`${p}.date`, "AAAA-MM-DD esperado");
    c.bool(`${p}.allDay`, b.allDay);
    if (b.allDay) {
      if (b.startTime !== null || b.endTime !== null) c.err(p, "bloqueio integral não tem horário");
    } else {
      if (typeof b.startTime !== "string" || !TIME.test(b.startTime)) c.err(`${p}.startTime`, "HH:MM esperado");
      if (typeof b.endTime !== "string" || !TIME.test(b.endTime)) c.err(`${p}.endTime`, "HH:MM esperado");
    }
    c.str(`${p}.reason`, b.reason, { max: 200 });
  });
  if (!Array.isArray(schedule.scheduleBlocks)) c.err("schedule.scheduleBlocks", "lista esperada");
}

function validateWhatsapp(c, wa) {
  if (!c.known("whatsapp", wa, ["templates"])) return;
  const keys = ["confirmation", "reminder", "return", "reschedule", "quote", "initialContact"];
  if (!c.known("whatsapp.templates", wa.templates, keys)) return;
  for (const key of keys) {
    const p = `whatsapp.templates.${key}`;
    const value = wa.templates[key];
    if (!c.str(p, value, { max: 1000 })) continue;
    const matches = value.match(/\{([^}]*)\}/g) || [];
    for (const m of matches) {
      const name = m.slice(1, -1);
      if (!WA_PLACEHOLDERS.has(name)) c.err(p, `placeholder desconhecido ${m}`);
    }
  }
}

export function validatePack(pack) {
  const c = new Ctx();
  const topAllowed = ["packVersion", "publishable", "tenant", "identity", "metadata", "content", "terminology", "settings", "catalog", "schedule", "whatsapp"];
  if (!isPlainObject(pack)) {
    c.err("$", "pack deve ser objeto");
    return result(c);
  }
  c.known("$", pack, topAllowed);
  if (pack.packVersion !== PACK_VERSION) c.err("packVersion", `esperado ${PACK_VERSION}`);
  if ("publishable" in pack) c.bool("publishable", pack.publishable);

  if (c.known("tenant", pack.tenant, ["slug", "name", "active"])) {
    if (typeof pack.tenant.slug !== "string" || !SLUG.test(pack.tenant.slug)) c.err("tenant.slug", "slug inválido");
    c.str("tenant.name", pack.tenant.name, { max: 120 });
    c.bool("tenant.active", pack.tenant.active);
  }
  if (c.known("identity", pack.identity, ["segment", "city", "schedule", "logo"])) {
    c.str("identity.segment", pack.identity.segment, { max: 80 });
    c.str("identity.city", pack.identity.city, { max: 80 });
    c.str("identity.schedule", pack.identity.schedule, { max: 80 });
    validateLogo(c, pack.identity.logo);
  }
  if (c.known("metadata", pack.metadata, ["title", "description", "themeColor", "image", "canonical"])) {
    c.str("metadata.title", pack.metadata.title, { max: 160 });
    c.str("metadata.description", pack.metadata.description, { max: 320 });
    c.hex("metadata.themeColor", pack.metadata.themeColor);
    c.httpsUrl("metadata.image", pack.metadata.image);
    c.httpsUrl("metadata.canonical", pack.metadata.canonical);
  }
  validateContent(c, pack.content);
  validateTerminology(c, pack.terminology);
  validateSettings(c, pack.settings);
  const ids = validateCatalog(c, pack.catalog) || {};
  validateSchedule(c, pack.schedule, ids.professionalIds);
  validateWhatsapp(c, pack.whatsapp);
  return result(c);
}

function result(c) {
  return { ok: c.errors.length === 0, errors: c.errors };
}

// Um pack marcado `publishable: false` (fixture neutra) valida como contrato,
// mas o provisionamento se recusa a publicá-lo.
export function isPublishable(pack) {
  return pack?.publishable !== false;
}
