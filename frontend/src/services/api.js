import tenant from "../config/tenant.js";

const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "");

function getBusinessQuery() {
  if (!tenant) {
    throw new Error("Experiência indisponível");
  }

  return `demoId=${encodeURIComponent(tenant.slug)}`;
}

async function request(path, options = {}) {
  if (!API_URL) {
    throw new Error("Serviço temporariamente indisponível");
  }

  const { headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...requestOptions,
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    credentials: "include"
  }).catch(() => {
    throw new Error("Serviço temporariamente indisponível");
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = response.status >= 500
      ? "Serviço temporariamente indisponível"
      : data?.message || "Não foi possível concluir a solicitação";
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  return data;
}

export const api = {
  // Públicas — tenant resolvido pela vertical (query demoId).
  getServices: () => request(`/services?${getBusinessQuery()}`),
  getProfessionals: () => request(`/professionals?${getBusinessQuery()}`),
  getBusinessHours: () => request(`/business-hours?${getBusinessQuery()}`),
  getAvailableSlots: ({ date, professionalId, serviceId }) =>
    request(`/available-slots?date=${encodeURIComponent(date)}&professionalId=${encodeURIComponent(professionalId)}&serviceId=${encodeURIComponent(serviceId)}&${getBusinessQuery()}`),
  createAppointment: (payload) => {
    const demoId = tenant?.slug;

    if (!demoId) {
      throw new Error("Experiência indisponível");
    }

    return request("/appointments", {
      method: "POST",
      body: JSON.stringify({ ...payload, demoId })
    });
  },
  captureLead: (payload) => {
    const demoId = tenant?.slug;
    if (!demoId) throw new Error("Experiência indisponível");
    return request("/public/leads", {
      method: "POST",
      body: JSON.stringify({ ...payload, demoId })
    });
  },
  getManagedAppointment: (token) =>
    request(`/public/appointment?${getBusinessQuery()}`, {
      headers: { "X-Appointment-Token": token }
    }),
  confirmManagedAppointment: (token) =>
    request(`/public/appointment/confirm?${getBusinessQuery()}`, {
      method: "POST",
      headers: { "X-Appointment-Token": token },
      body: JSON.stringify({})
    }),
  cancelManagedAppointment: (token, reason) =>
    request(`/public/appointment/cancel?${getBusinessQuery()}`, {
      method: "POST",
      headers: { "X-Appointment-Token": token },
      body: JSON.stringify({ reason })
    }),
  getRescheduleAvailability: ({ token, date, professionalId }) =>
    request(`/public/appointment/reschedule-availability?date=${encodeURIComponent(date)}&professionalId=${encodeURIComponent(professionalId)}&${getBusinessQuery()}`, {
      headers: { "X-Appointment-Token": token }
    }),
  rescheduleManagedAppointment: (token, payload) =>
    request(`/public/appointment/reschedule?${getBusinessQuery()}`, {
      method: "POST",
      headers: { "X-Appointment-Token": token },
      body: JSON.stringify(payload)
    }),

  // Administrativas — tenant derivado da sessão; nada de demoId como autoridade.
  adminLogin: (email, password) => {
    const demoId = tenant?.slug;

    if (!demoId) {
      throw new Error("Experiência indisponível");
    }

    return request("/admin/session", {
      method: "POST",
      body: JSON.stringify({ email, password, demoId })
    });
  },
  adminMe: () => request("/admin/me"),
  adminLogout: () => request("/admin/session", { method: "DELETE" }),
  getAppointments: () => request("/appointments"),
  getProfessionalSchedules: (professionalId) =>
    request(`/admin/professional-schedules${professionalId ? `?professionalId=${encodeURIComponent(professionalId)}` : ""}`),
  createProfessionalSchedule: (payload) =>
    request("/admin/professional-schedules", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateProfessionalSchedule: (id, payload) =>
    request(`/admin/professional-schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteProfessionalSchedule: (id) =>
    request(`/admin/professional-schedules/${id}`, { method: "DELETE" }),
  getScheduleBlocks: (from, to) =>
    request(`/admin/schedule-blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createScheduleBlock: (payload) =>
    request("/admin/schedule-blocks", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateScheduleBlock: (id, payload) =>
    request(`/admin/schedule-blocks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteScheduleBlock: (id) =>
    request(`/admin/schedule-blocks/${id}`, { method: "DELETE" }),
  updateAppointmentStatus: (id, status, reason) =>
    request(`/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason })
    }),
  getAppointmentHistory: (id) => request(`/appointments/${id}/history`),
  getClients: (search = "") => request(`/admin/clients${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getClient: (id) => request(`/admin/clients/${id}`),
  updateClient: (id, payload) => request(`/admin/clients/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  addClientNote: (id, note) => request(`/admin/clients/${id}/notes`, { method: "POST", body: JSON.stringify({ note }) }),
  getClientHistory: (id) => request(`/admin/clients/${id}/history`),
  getLeads: ({ status = "", source = "" } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (source) params.set("source", source);
    return request(`/admin/leads${params.size ? `?${params}` : ""}`);
  },
  createLead: (payload) => request("/admin/leads", { method: "POST", body: JSON.stringify(payload) }),
  updateLeadStatus: (id, status) => request(`/admin/leads/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  loseLead: (id, reason) => request(`/admin/leads/${id}/lost`, { method: "POST", body: JSON.stringify({ reason }) }),
  linkLeadAppointment: (id, appointmentId) => request(`/admin/leads/${id}/appointment`, { method: "POST", body: JSON.stringify({ appointmentId }) }),
  convertLead: (id, appointmentId) => request(`/admin/leads/${id}/convert`, { method: "POST", body: JSON.stringify({ appointmentId }) }),
  getFollowUps: ({ from = "", to = "", overdue = false } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (overdue) params.set("overdue", "true");
    return request(`/admin/follow-ups${params.size ? `?${params}` : ""}`);
  },
  createFollowUp: (payload) => request("/admin/follow-ups", { method: "POST", body: JSON.stringify(payload) }),
  completeFollowUp: (id) => request(`/admin/follow-ups/${id}/complete`, { method: "POST", body: JSON.stringify({}) }),
  cancelFollowUp: (id) => request(`/admin/follow-ups/${id}/cancel`, { method: "POST", body: JSON.stringify({}) }),
  getExportUrl: () => `${API_URL}/appointments/export.csv`
};
