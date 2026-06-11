const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Erro ao comunicar com a API");
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
    })
};
