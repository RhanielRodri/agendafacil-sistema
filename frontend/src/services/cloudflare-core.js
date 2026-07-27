import tenant from "../config/tenant.js";

// O tenant vem exclusivamente do slug da rota. Nada de demoId, tenantId ou
// header: o Worker público resolve pelo caminho e o Worker administrativo
// autoriza o slug contra a membership da identidade do Cloudflare Access.
export const BASE = (import.meta.env.VITE_CF_API_URL || "").replace(/\/$/, "");

function tenantSlug() {
  if (!tenant) throw new Error("Experiência indisponível");
  return encodeURIComponent(tenant.slug);
}

function queryString(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== false && value !== null && value !== undefined) params.set(key, String(value));
  });
  return params.size ? `?${params}` : "";
}

const MESSAGE_BY_STATUS = {
  400: "Não foi possível concluir a solicitação",
  401: "Sua sessão do Cloudflare Access expirou",
  403: "Você não tem acesso a este painel",
  404: "Registro não encontrado",
  409: "Existe um conflito com o estado atual",
  429: "Muitas solicitações. Aguarde um instante e tente de novo.",
  500: "Serviço temporariamente indisponível"
};

function toError(status, payload) {
  const detail = payload?.error || payload || {};
  const message = status >= 500
    ? MESSAGE_BY_STATUS[500]
    : detail.message || MESSAGE_BY_STATUS[status] || "Não foi possível concluir a solicitação";
  const error = new Error(message);
  error.status = status;
  error.code = detail.code;
  if (Array.isArray(detail.conflicts)) error.conflicts = detail.conflicts;
  if (detail.dependencies && typeof detail.dependencies === "object") {
    error.dependencies = detail.dependencies;
  }
  return error;
}

async function request(url, options = {}) {
  const { headers, body, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers
    },
    ...(body === undefined ? {} : { body }),
    credentials: "include"
  }).catch(() => {
    throw new Error("Serviço temporariamente indisponível");
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw toError(response.status, payload);
  return payload;
}

const send = (url, method, payload) =>
  request(url, { method, body: JSON.stringify(payload ?? {}) });

const tokenHeaders = (token) => ({ "X-Appointment-Token": token });

export { tenantSlug, queryString, request, send, tokenHeaders };
