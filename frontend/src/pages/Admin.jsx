import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import AppointmentCard from "../components/AppointmentCard.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { formatCurrency, todayInputValue } from "../utils/format.js";

export default function Admin({ services, professionals }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function loadAppointments() {
    setLoading(true);
    setError("");
    api.getAppointments()
      .then(setAppointments)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAppointments();
  }, []);

  const metrics = useMemo(() => {
    const today = todayInputValue();
    const weekLimit = new Date();
    weekLimit.setDate(weekLimit.getDate() + 7);

    const todayTotal = appointments.filter((appointment) => appointment.date.slice(0, 10) === today).length;
    const weekTotal = appointments.filter((appointment) => {
      const date = new Date(appointment.date);
      return date >= new Date(`${today}T00:00:00`) && date <= weekLimit;
    }).length;
    const byStatus = appointments.reduce((acc, appointment) => {
      acc[appointment.status] = (acc[appointment.status] || 0) + 1;
      return acc;
    }, {});

    return { todayTotal, weekTotal, byStatus };
  }, [appointments]);

  const nextAppointments = appointments
    .filter((appointment) => appointment.status !== "CANCELLED")
    .slice(0, 5);

  function handleStatusChange(id, status) {
    api.updateAppointmentStatus(id, status)
      .then(loadAppointments)
      .catch((requestError) => setError(requestError.message));
  }

  return (
    <main className="admin-page">
      <section className="section">
        <div className="section-heading">
          <span>Admin</span>
          <h1>Painel Studio Cut</h1>
        </div>

        {error && <StateMessage type="error" title="Erro no painel">{error}</StateMessage>}

        <div className="metrics-grid">
          <article>
            <span>Hoje</span>
            <strong>{metrics.todayTotal}</strong>
          </article>
          <article>
            <span>Próximos 7 dias</span>
            <strong>{metrics.weekTotal}</strong>
          </article>
          <article>
            <span>Novos</span>
            <strong>{metrics.byStatus.NEW || 0}</strong>
          </article>
          <article>
            <span>Confirmados</span>
            <strong>{metrics.byStatus.CONFIRMED || 0}</strong>
          </article>
        </div>

        <div className="admin-grid">
          <section className="panel">
            <h2>Próximos agendamentos</h2>
            {loading && <StateMessage type="loading" title="Carregando agendamentos" />}
            {!loading && nextAppointments.length === 0 && <StateMessage title="Nenhum próximo agendamento" />}
            <div className="stack">
              {nextAppointments.map((appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Serviços</h2>
            <div className="stack">
              {services.map((service) => (
                <div className="compact-row" key={service.id}>
                  <strong>{service.name}</strong>
                  <span>{formatCurrency(service.price)} · {service.duration} min</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="admin-grid">
          <section className="panel">
            <h2>Todos os agendamentos</h2>
            {!loading && appointments.length === 0 && <StateMessage title="Nenhum agendamento cadastrado" />}
            <div className="stack">
              {appointments.map((appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Profissionais</h2>
            <div className="stack">
              {professionals.map((professional) => (
                <div className="compact-row" key={professional.id}>
                  <strong>{professional.name}</strong>
                  <span>{professional.specialty}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
