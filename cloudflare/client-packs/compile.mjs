// Projeções de um Client Pack para os artefatos que o runtime consome.
//
// O front usa deployment fixado por vertical: cada bundle só pode conter a
// identidade do seu tenant (a outra é substituída por `absent.js` e eliminada
// como código morto). Por isso o pack NÃO é lido em runtime — ele é a fonte de
// verdade de build que projeta o módulo de configuração por tenant. Um gate de
// igualdade garante que o módulo versionado é fiel ao pack, sem alterar o
// comportamento nem a identidade das verticais existentes.

// Objeto de configuração pública/painel, no mesmo formato de
// `frontend/src/config/demos/<slug>.js`.
export function compileFrontendConfig(pack) {
  return {
    slug: pack.tenant.slug,
    name: pack.tenant.name,
    segment: pack.identity.segment,
    city: pack.identity.city,
    schedule: pack.identity.schedule,
    logo: pack.identity.logo,
    metadata: pack.metadata,
    hero: pack.content.hero,
    details: pack.content.details,
    process: pack.content.process,
    space: pack.content.space,
    copy: pack.content.copy,
    footer: pack.content.footer
  };
}

// Entrada de terminologia operacional, no mesmo formato de
// `frontend/src/config/verticals.js`.
export function compileTerminology(pack) {
  const t = pack.terminology;
  return {
    dayTitle: t.dayTitle,
    waitingSource: t.waitingSource,
    waitingLabel: t.waitingLabel,
    waitingHint: t.waitingHint,
    showOccupancy: t.showOccupancy,
    serviceNoun: t.serviceNoun,
    servicePlural: t.servicePlural,
    professionalNoun: t.professionalNoun,
    professionalPlural: t.professionalPlural,
    showEvaluationFlag: t.showEvaluationFlag,
    metricHighlights: t.metricHighlights,
    attentionOrder: t.attentionOrder,
    leadShortcuts: t.leadShortcuts
  };
}

// camelCase do slug para o nome da const no módulo gerado (studio-cut →
// studioCut). Um slug de palavra única fica inalterado (lumiere → lumiere).
export function moduleVarName(slug) {
  return slug.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

// Serializa um valor JS no estilo do módulo escrito à mão: chaves sem aspas,
// strings com aspas duplas, 2 espaços de indentação. Arrays de escalares ficam
// em linha; arrays de objetos, um item por linha.
function serialize(value, indent) {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const allScalar = value.every((v) => typeof v !== "object" || v === null);
    if (allScalar) {
      return `[${value.map((v) => serialize(v, indent)).join(", ")}]`;
    }
    const items = value.map((v) => `${padIn}${serialize(v, indent + 1)}`);
    return `[\n${items.join(",\n")}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    // Objetos pequenos e planos (itens de lista) ficam em linha única.
    const flat = keys.every((k) => typeof value[k] !== "object" || value[k] === null);
    if (flat && indent >= 3) {
      return `{ ${keys.map((k) => `${k}: ${serialize(value[k], indent)}`).join(", ")} }`;
    }
    const lines = keys.map((k) => `${padIn}${k}: ${serialize(value[k], indent + 1)}`);
    return `{\n${lines.join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

// Texto completo do módulo `demos/<slug>.js` a partir do pack.
export function renderFrontendModule(pack) {
  const varName = moduleVarName(pack.tenant.slug);
  const config = compileFrontendConfig(pack);
  return `const ${varName} = ${serialize(config, 0)};\n\nexport default ${varName};\n`;
}
