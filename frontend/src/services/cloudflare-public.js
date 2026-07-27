import { BASE, queryString, request, send, tenantSlug, tokenHeaders } from "./cloudflare-core.js";

function publicBase() {
  return `${BASE}/api/tenants/${tenantSlug()}`;
}

// Só o Public Worker: nenhuma rota administrativa entra neste bundle.
export const cloudflarePublicApi = {

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
      body: JSON.stringify({ reason, confirmed: true })
    }),
  getRescheduleAvailability: ({ token, date, professionalId }) =>
    request(`${publicBase()}/appointment/reschedule-availability${queryString({ date, professionalId })}`, {
      headers: tokenHeaders(token)
    }),
  rescheduleManagedAppointment: (token, payload) =>
    request(`${publicBase()}/appointment/reschedule`, {
      method: "POST",
      headers: tokenHeaders(token),
      body: JSON.stringify({ ...payload, confirmed: true })
    })
};

export default cloudflarePublicApi;
