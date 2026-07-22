import tenant from "../config/tenant.js";

// O tenant vem exclusivamente do slug da rota. Nada de demoId, tenantId ou
// header: o Worker público resolve pelo caminho e o Worker administrativo
// autoriza o slug contra a membership da identidade do Cloudflare Access.
const BASE = (import.meta.env.VITE_CF_API_URL || "").replace(/\/$/, "");

function tenantSlug() {
  if (!tenant) throw new Error("Experiência indisponível");
  return encodeURIComponent(tenant.slug);
}

function publicBase() {
  return `${BASE}/api/tenants/${tenantSlug()}`;
}

function adminBase() {
  return `${BASE}/api/admin/tenants/${tenantSlug()}`;
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

export const cloudflareApi = {
  // ─── Público (Public Worker) ──────────────────────────────────────────────
  getServices: () => request(`${publicBase()}/services`),
  getProfessionals: () => request(`${publicBase()}/professionals`),
  getBusinessHours: () => request(`${publicBase()}/business-hours`),
  getPublicContext: () => request(`${publicBase()}/context`),
  getPublicSettings: () => request(`${publicBase()}/settings`),
  getAvailableSlots: ({ date, professionalId, serviceId }) =>
    request(`${publicBase()}/available-slots${queryString({ date, professionalId, serviceId })}`),
  createAppointment: (payload) => send(`${publicBase()}/appointments`, "POST", payload),
  captureLead: (payload) => send(`${publicBase()}/leads`, "POST", payload),
  getManagedAppointment: (token) =>
    request(`${publicBase()}/appointment`, { headers: tokenHeaders(token) }),
  confirmManagedAppointment: (token) =>
    request(`${publicBase()}/appointment/confirm`, { method: "POST", headers: tokenHeaders(token), body: "{}" }),
  cancelManagedAppointment: (token, reason) =>
    request(`${publicBase()}/appointment/cancel`, {
      method: "POST",
      headers: tokenHeaders(token),
      body: JSON.stringify({ reason })
    }),
  getRescheduleAvailability: ({ token, date, professionalId }) =>
    request(`${publicBase()}/appointment/reschedule-availability${queryString({ date, professionalId })}`, {
      headers: tokenHeaders(token)
    }),
  rescheduleManagedAppointment: (token, payload) =>
    request(`${publicBase()}/appointment/reschedule`, {
      method: "POST",
      headers: tokenHeaders(token),
      body: JSON.stringify(payload)
    }),

  // ─── Identidade (Cloudflare Access) ───────────────────────────────────────
  // Sem login, sem senha e sem sessão própria: o Access injeta a asserção e o
  // Worker responde 401 quando ela falta ou expira, e 403 sem membership.
  adminIdentity: () => request(`${BASE}/api/admin/context`),
  adminContext: () => request(`${adminBase()}/context`),
  getAdminUsers: () => request(`${adminBase()}/identities`),

  // ─── Operação administrativa (Admin Worker) ───────────────────────────────
  getOverview: (date) => request(`${adminBase()}/overview${queryString({ date })}`),
  getAgendaDay: (filters = {}) => request(`${adminBase()}/agenda${queryString(filters)}`),
  getAppointments: (filters = {}) => request(`${adminBase()}/appointments${queryString(filters)}`),
  updateAppointmentStatus: (id, status, reason) =>
    send(`${adminBase()}/appointments/${encodeURIComponent(id)}/status`, "PATCH", { status, reason }),
  getAppointmentHistory: (id) => request(`${adminBase()}/appointments/${encodeURIComponent(id)}/history`),
  getExportUrl: () => `${adminBase()}/appointments/export.csv`,

  getAdminServices: (filters = {}) => request(`${adminBase()}/services${queryString(filters)}`),
  createAdminService: (payload) => send(`${adminBase()}/services`, "POST", payload),
  updateAdminService: (id, payload) => send(`${adminBase()}/services/${encodeURIComponent(id)}`, "PATCH", payload),
  setAdminServiceActive: (id, active, confirm = false) =>
    send(`${adminBase()}/services/${encodeURIComponent(id)}/active`, "PATCH", { active, confirm }),
  reorderAdminServices: (order) => send(`${adminBase()}/services/order`, "PATCH", { order }),
  getServiceDependencies: (id) => request(`${adminBase()}/services/${encodeURIComponent(id)}/dependencies`),

  getAdminProfessionals: (filters = {}) => request(`${adminBase()}/professionals${queryString(filters)}`),
  createAdminProfessional: (payload) => send(`${adminBase()}/professionals`, "POST", payload),
  updateAdminProfessional: (id, payload) =>
    send(`${adminBase()}/professionals/${encodeURIComponent(id)}`, "PATCH", payload),
  setAdminProfessionalActive: (id, active, confirm = false) =>
    send(`${adminBase()}/professionals/${encodeURIComponent(id)}/active`, "PATCH", { active, confirm }),
  setProfessionalServices: (id, serviceIds) =>
    send(`${adminBase()}/professionals/${encodeURIComponent(id)}/services`, "PUT", { serviceIds }),
  reorderAdminProfessionals: (order) => send(`${adminBase()}/professionals/order`, "PATCH", { order }),
  getProfessionalDependencies: (id) =>
    request(`${adminBase()}/professionals/${encodeURIComponent(id)}/dependencies`),

  getAdminBusinessHours: () => request(`${adminBase()}/business-hours`),
  updateBusinessHours: (days, confirm = false) => send(`${adminBase()}/business-hours`, "PUT", { days, confirm }),
  getProfessionalSchedules: (professionalId) =>
    request(`${adminBase()}/professional-schedules${queryString({ professionalId })}`),
  createProfessionalSchedule: (payload) => send(`${adminBase()}/professional-schedules`, "POST", payload),
  updateProfessionalSchedule: (id, payload) =>
    send(`${adminBase()}/professional-schedules/${encodeURIComponent(id)}`, "PATCH", payload),
  deleteProfessionalSchedule: (id, confirm = false) =>
    request(`${adminBase()}/professional-schedules/${encodeURIComponent(id)}${confirm ? "?confirm=true" : ""}`, {
      method: "DELETE"
    }),
  copyProfessionalSchedules: (payload) => send(`${adminBase()}/professional-schedules/copy`, "POST", payload),

  getScheduleBlocks: (filters = {}) => request(`${adminBase()}/schedule-blocks${queryString(filters)}`),
  createScheduleBlock: (payload) => send(`${adminBase()}/schedule-blocks`, "POST", payload),
  updateScheduleBlock: (id, payload) => send(`${adminBase()}/schedule-blocks/${encodeURIComponent(id)}`, "PATCH", payload),
  deleteScheduleBlock: (id) => request(`${adminBase()}/schedule-blocks/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getClients: (filters = {}) =>
    request(`${adminBase()}/clients${queryString(typeof filters === "string" ? { search: filters } : filters)}`),
  getClient: (id) => request(`${adminBase()}/clients/${encodeURIComponent(id)}`),
  updateClient: (id, payload) => send(`${adminBase()}/clients/${encodeURIComponent(id)}`, "PATCH", payload),
  addClientNote: (id, note) => send(`${adminBase()}/clients/${encodeURIComponent(id)}/notes`, "POST", { note }),
  getClientHistory: (id) => request(`${adminBase()}/clients/${encodeURIComponent(id)}/history`),

  getLeads: (filters = {}) => request(`${adminBase()}/leads${queryString(filters)}`),
  getLead: (id) => request(`${adminBase()}/leads/${encodeURIComponent(id)}`),
  createLead: (payload) => send(`${adminBase()}/leads`, "POST", payload),
  updateLeadStatus: (id, status, nextFollowUp) =>
    send(`${adminBase()}/leads/${encodeURIComponent(id)}/status`, "PATCH", {
      status,
      ...(nextFollowUp ? { nextFollowUp } : {})
    }),
  updateLeadPriority: (id, priority) =>
    send(`${adminBase()}/leads/${encodeURIComponent(id)}/priority`, "PATCH", { priority }),
  assignLeadOwner: (id, ownerUserId) =>
    send(`${adminBase()}/leads/${encodeURIComponent(id)}/owner`, "PATCH", { ownerUserId }),
  updateLeadQualification: (id, qualification) =>
    send(`${adminBase()}/leads/${encodeURIComponent(id)}/qualification`, "PATCH", { qualification }),
  addLeadNote: (id, content) => send(`${adminBase()}/leads/${encodeURIComponent(id)}/notes`, "POST", { content }),
  loseLead: (id, lostReason, lostReasonNote = "") =>
    send(`${adminBase()}/leads/${encodeURIComponent(id)}/lost`, "POST", { lostReason, lostReasonNote }),
  linkLeadAppointment: (id, appointmentId) =>
    send(`${adminBase()}/leads/${encodeURIComponent(id)}/appointment`, "POST", { appointmentId }),
  convertLead: (id, payload) =>
    send(`${adminBase()}/leads/${encodeURIComponent(id)}/convert`, "POST",
      typeof payload === "number" || typeof payload === "string" ? { appointmentId: payload } : payload),

  getFollowUps: (filters = {}) => request(`${adminBase()}/follow-ups${queryString(filters)}`),
  createFollowUp: (payload) => send(`${adminBase()}/follow-ups`, "POST", payload),
  completeFollowUp: (id, nextFollowUp) =>
    send(`${adminBase()}/follow-ups/${encodeURIComponent(id)}/complete`, "POST", nextFollowUp ? { nextFollowUp } : {}),
  cancelFollowUp: (id) => send(`${adminBase()}/follow-ups/${encodeURIComponent(id)}/cancel`, "POST", {}),
  assignFollowUpOwner: (id, ownerUserId) =>
    send(`${adminBase()}/follow-ups/${encodeURIComponent(id)}/owner`, "PATCH", { ownerUserId }),

  getAdminSettings: () => request(`${adminBase()}/settings`),
  updateAdminSettings: (payload) => send(`${adminBase()}/settings`, "PATCH", payload),
  getMetrics: (filters = {}) => request(`${adminBase()}/metrics${queryString(filters)}`)
};

export default cloudflareApi;
