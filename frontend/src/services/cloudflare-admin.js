import { BASE, queryString, request, send, tenantSlug } from "./cloudflare-core.js";

function adminBase() {
  return `${BASE}/api/admin/tenants/${tenantSlug()}`;
}

// Só o Admin Worker: nenhuma rota pública entra neste bundle.
export const cloudflareAdminApi = {
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
  getClientDependencies: (id) =>
    request(`${adminBase()}/clients/${encodeURIComponent(id)}/dependencies`),
  archiveClient: (id) =>
    send(`${adminBase()}/clients/${encodeURIComponent(id)}/archive`, "PATCH", {}),
  restoreClient: (id) =>
    send(`${adminBase()}/clients/${encodeURIComponent(id)}/restore`, "PATCH", {}),
  deleteClient: (id) =>
    request(`${adminBase()}/clients/${encodeURIComponent(id)}`, { method: "DELETE" }),

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
  getMetrics: (filters = {}) => request(`${adminBase()}/metrics${queryString(filters)}`),

  getTeam: () => request(`${adminBase()}/team`),
  createTeamMember: (payload) => send(`${adminBase()}/team`, "POST", payload),
  updateTeamMember: (id, payload) =>
    send(`${adminBase()}/team/${encodeURIComponent(id)}`, "PATCH", payload),
  setTeamMemberActive: (id, active) =>
    send(`${adminBase()}/team/${encodeURIComponent(id)}/active`, "PATCH", { active }),
  getTeamAudit: (filters = {}) =>
    request(`${adminBase()}/team/audit${queryString(filters)}`)
};

export default cloudflareAdminApi;
