const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "");

async function request(path, options = {}) {
  if (!API_URL) {
    throw new Error("VITE_API_URL não configurada");
  }

  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    credentials: "include",
    ...options
  }).catch(() => {
    throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão.");
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const err = new Error(data?.message || "Erro ao comunicar com a API");
    err.status = response.status;
    throw err;
  }

  return data;
}

export const api = {
  getServices: () => request("/services"),
  getProfessionals: () => request("/professionals"),
  getAppointments: () => request("/appointments"),
  getBusinessHours: () => request("/business-hours"),
  getAvailableSlots: ({ date, professionalId, serviceId }) =>
    request(`/available-slots?date=${encodeURIComponent(date)}&professionalId=${encodeURIComponent(professionalId)}&serviceId=${encodeURIComponent(serviceId)}`),
  createAppointment: (payload) =>
    request("/appointments", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateAppointmentStatus: (id, status) =>
    request(`/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  adminLogin: (password) =>
    request("/admin/session", {
      method: "POST",
      body: JSON.stringify({ password })
    }),
  adminLogout: () =>
    request("/admin/session", { method: "DELETE" })
};
