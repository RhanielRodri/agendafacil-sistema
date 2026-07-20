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

  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    credentials: "include",
    ...options
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
    throw error;
  }

  return data;
}

export const api = {
  getServices: () => request(`/services?${getBusinessQuery()}`),
  getProfessionals: () => request(`/professionals?${getBusinessQuery()}`),
  getAppointments: () => request(`/appointments?${getBusinessQuery()}`),
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
  updateAppointmentStatus: (id, status) =>
    request(`/appointments/${id}/status?${getBusinessQuery()}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  adminLogin: (password) =>
    request("/admin/session", {
      method: "POST",
      body: JSON.stringify({ password })
    }),
  adminLogout: () => request("/admin/session", { method: "DELETE" }),
  getExportUrl: () => `${API_URL}/appointments/export.csv?${getBusinessQuery()}`
};
