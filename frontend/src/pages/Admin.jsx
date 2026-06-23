import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import AppointmentCard from "../components/AppointmentCard.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { formatCurrency, todayInputValue } from "../utils/format.js";

function LoginOverlay({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.adminLogin(password);
      onSuccess();
    } catch (err) {
      setError(err.message || "Senha incorreta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg-light)", zIndex: 100
    }}>
      <form onSubmit={handleSubmit} className="panel" style={{ width: "100%", maxWidth: 360 }}>
        <h2 style={{ marginBottom: 20 }}>Painel administrativo</h2>
        {error && (
          <div className="state error" style={{ marginBottom: 12 }}>
            <strong>{error}</strong>
          </div>
        )}
        <label>
          Senha de acesso
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        <div className="actions">
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Admin({ services, professionals }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  function loadAppointments() {
    setLoading(true);
    setError("");
    api.getAppointments()
      .then(setAppointments)
      .catch((requestError) => {
        if (requestError.status === 401) {
          setNeedsLogin(true);
        } else {
          setError(requestError.message);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAppointments();
  }, []);

  if (needsLogin) {
    return <LoginOverlay onSuccess={() => { setNeedsLogin(false); loadAppointments(); }} />;
  }

  const metrics = useMemo(() => {
    const today = todayInputValue();
    const weekLimit = new Date();
    weekLimit.setDate(weekLimit.getDate() + 7);

    const todayTotal = appointments.filter(
      (appointment) => appointment.date.slice(0, 10) === today
    ).length;
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
      <header className="admin-header">
        <div className="admin-header-brand">
          <strong>AgendaFácil</strong>
          <span>· Painel demonstrativo</span>
        </div>
        <span className="admin-demo-notice">Ambiente demonstrativo · Dados fictícios</span>
      </header>

      <section className="section">
        {error && (
          <StateMessage type="error" title="Erro ao carregar dados" onRetry={loadAppointments}>
            {error}
          </StateMessage>
        )}

        <div className="metrics-grid">
          <article>
            <span className="metric-label">Hoje</span>
            <strong className="metric-value accent">{metrics.todayTotal}</strong>
          </article>
          <article>
            <span className="metric-label">Confirmados</span>
            <strong className="metric-value success">{metrics.byStatus.CONFIRMED || 0}</strong>
          </article>
          <article>
            <span className="metric-label">Novos</span>
            <strong className="metric-value warning">{metrics.byStatus.NEW || 0}</strong>
          </article>
          <article>
            <span className="metric-label">Próximos 7 dias</span>
            <strong className="metric-value neutral">{metrics.weekTotal}</strong>
          </article>
        </div>

        <div className="admin-grid">
          <section className="panel">
            <h2>Próximos agendamentos</h2>
            {loading && <StateMessage type="loading" title="Carregando agendamentos" />}
            {!loading && nextAppointments.length === 0 && (
              <StateMessage title="Nenhum próximo agendamento" />
            )}
            <div className="stack">
              {nextAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onStatusChange={handleStatusChange}
                />
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
            {!loading && appointments.length === 0 && (
              <StateMessage title="Nenhum agendamento cadastrado" />
            )}
            <div className="stack">
              {appointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onStatusChange={handleStatusChange}
                />
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
