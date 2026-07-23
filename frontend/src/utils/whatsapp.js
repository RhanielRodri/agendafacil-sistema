// Operação manual de WhatsApp: só links wa.me e templates renderizados no
// cliente. Sem API, automação, fila ou disparo — a pessoa revisa e envia.
//
// Os templates padrão espelham o Client Pack neutro (template.json). Um cliente
// pode sobrescrevê-los no seu pack; até haver um seletor no painel, o padrão do
// produto é usado. Um teste garante que padrão e pack neutro não divergem.

export const TEMPLATE_KINDS = ["confirmation", "reminder", "return", "reschedule", "quote", "initialContact"];

export const DEFAULT_TEMPLATES = {
  confirmation: "Olá {cliente}! Seu horário na {negocio} está confirmado: {servico} em {data} às {hora}.",
  reminder: "Olá {cliente}! Lembrete: {servico} na {negocio} amanhã, {data} às {hora}.",
  return: "Olá {cliente}! Quer marcar um novo {servico} na {negocio}?",
  reschedule: "Olá {cliente}! Precisamos ajustar seu {servico} de {data} às {hora}. Qual horário fica melhor?",
  quote: "Olá {cliente}! Sobre o {servico} na {negocio}: posso enviar detalhes e valores.",
  initialContact: "Olá {cliente}! Aqui é da {negocio}. Vamos ajudar a agendar seu horário."
};

// Normaliza para o formato que o wa.me espera: só dígitos, com código do país.
// Brasil (55) por padrão quando o número vem só com DDD.
export function normalizeWaPhone(phone, defaultCountry = "55") {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith(defaultCountry) && digits.length >= 12) return digits;
  if (digits.length <= 11) return `${defaultCountry}${digits}`;
  return digits;
}

// Preenche {placeholders} com o contexto; chave ausente vira vazio. Colapsa
// espaços gerados por um placeholder vazio para não deixar buracos no texto.
export function renderTemplate(template, context = {}) {
  if (!template) return "";
  return template
    .replace(/\{([a-zA-Z]+)\}/g, (_, key) => (context[key] != null ? String(context[key]) : ""))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

// Link wa.me. Sem número válido, retorna null (a UI então não oferece a ação).
export function waMeUrl(phone, message = "") {
  const digits = normalizeWaPhone(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  const text = message ? renderTemplate(message) : "";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

// Conveniência: escolhe um template (do pack ou o padrão) e monta o link.
export function buildWaAction({ phone, kind = "confirmation", context = {}, templates = DEFAULT_TEMPLATES }) {
  const template = (templates && templates[kind]) || DEFAULT_TEMPLATES[kind] || "";
  const message = renderTemplate(template, context);
  const url = waMeUrl(phone, message);
  return url ? { url, message } : null;
}
