import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import AppointmentCard from "../components/AppointmentCard.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { formatCurrency, todayInputValue } from "../utils/format.js";
import tenant from "../config/tenant.js";

// ─── Telas de estado (fundo escuro, card centralizado) ──────────────────────

function AdminScreenHeader() {
  return (
    <div className="admin-screen-header">
      <div className="admin-screen-brand">AgendaFácil</div>
      <span className="admin-screen-badge">{tenant.name}</span>
    </div>
  );
}

function AdminScreen({ children }) {
  return (
    <div className="admin-screen">
      <div className="admin-screen-card">{children}</div>
    </div>
  );
}

function LoginScreen({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoginError("");
    setSubmitting(true);
    try {
      await api.adminLogin(password);
      onSuccess();
    } catch (err) {
      setLoginError(err.message || "Senha incorreta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Painel administrativo</h2>
      <p className="admin-screen-hint">
        Área restrita para gerenciamento dos agendamentos.
      </p>
      {loginError && (
        <p className="admin-screen-error" role="alert">{loginError}</p>
      )}
      <form onSubmit={handleSubmit}>
        <label className="admin-screen-label">
          Senha de acesso
          <div className="admin-screen-input-wrap">
            <svg className="admin-screen-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              className="admin-screen-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              placeholder="••••••••"
            />
          </div>
        </label>
        <button className="admin-screen-btn" type="submit" disabled={submitting}>
          {submitting ? (
            <span className="admin-screen-btn-loading">
              <span className="admin-screen-spinner" />
              Entrando…
            </span>
          ) : "Entrar"}
        </button>
      </form>
    </AdminScreen>
  );
}

function LoadingScreen() {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <div className="admin-screen-loading-body">
        <span className="admin-screen-spinner admin-screen-spinner--lg" />
        <p className="admin-screen-message">Carregando painel…</p>
      </div>
    </AdminScreen>
  );
}

function UnavailableScreen({ onRetry }) {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Painel indisponível</h2>
      <p className="admin-screen-message">
        O painel administrativo está temporariamente indisponível.<br />
        Tente novamente em instantes.
      </p>
      <button className="admin-screen-btn" type="button" onClick={onRetry}>
        Tentar novamente
      </button>
    </AdminScreen>
  );
}

function ErrorScreen({ message, onRetry }) {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Erro ao carregar</h2>
      <p className="admin-screen-message">{message}</p>
      <button className="admin-screen-btn" type="button" onClick={onRetry}>
        Tentar novamente
      </button>
    </AdminScreen>
  );
}

// ─── Dashboard principal ─────────────────────────────────────────────────────

export default function Admin({ services, professionals }) {
  const [status, setStatus] = useState("loading");
  const [appointments, setAppointments] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusChangeError, setStatusChangeError] = useState("");

  const safeAppointments = Array.isArray(appointments) ? appointments : [];
  const safeServices = Array.isArray(services) ? services : [];
  const safeProfessionals = Array.isArray(professionals) ? professionals : [];

  // Todos os hooks ANTES de qualquer early return
  const metrics = useMemo(() => {
    const today = todayInputValue();
    const weekLimit = new Date();
    weekLimit.setDate(weekLimit.getDate() + 7);

    const todayTotal = safeAppointments.filter(
      (a) => a.date.slice(0, 10) === today
    ).length;

    const weekTotal = safeAppointments.filter((a) => {
      const date = new Date(a.date);
      return date >= new Date(`${today}T00:00:00`) && date <= weekLimit;
    }).length;

    const byStatus = safeAppointments.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {});

    return { todayTotal, weekTotal, byStatus };
  }, [safeAppointments]);

  const nextAppointments = safeAppointments
    .filter((a) => a.status !== "CANCELLED")
    .slice(0, 5);

  function loadAppointments() {
    setStatus("loading");
    setErrorMsg("");
    setStatusChangeError("");
    api.getAppointments()
      .then((data) => {
        setAppointments(Array.isArray(data) ? data : []);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (err.status === 401) {
          setAppointments([]);
          setStatus("unauthenticated");
        } else if (err.status === 503) {
          setStatus("unavailable");
        } else {
          setErrorMsg(err.message || "Erro ao carregar agendamentos");
          setStatus("error");
        }
      });
  }

  useEffect(() => {
    loadAppointments();
  }, []);

  function handleStatusChange(id, newStatus) {
    setStatusChangeError("");
    api.updateAppointmentStatus(id, newStatus)
      .then(loadAppointments)
      .catch((err) => setStatusChangeError(err.message));
  }

  function handleLogout() {
    api.adminLogout()
      .finally(() => {
        setAppointments([]);
        setStatus("unauthenticated");
      });
  }

  // ─── Estados de tela completa ──────────────────────────────────────────────
  if (status === "loading") return <LoadingScreen />;
  if (status === "unauthenticated") return <LoginScreen onSuccess={loadAppointments} />;
  if (status === "unavailable") return <UnavailableScreen onRetry={loadAppointments} />;
  if (status === "error") return <ErrorScreen message={errorMsg} onRetry={loadAppointments} />;

  // ─── Dashboard (só renderiza quando authenticated) ─────────────────────────
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-header-brand">
          <strong>{tenant.name}</strong>
          <span>· Painel administrativo</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: "none",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 12px",
              fontSize: "0.8rem",
              color: "var(--text-on-light-muted)",
              cursor: "pointer"
            }}
          >
            Sair
          </button>
        </div>
      </header>

      <section className="section">
        {statusChangeError && (
          <StateMessage type="error" title="Erro ao alterar status">
            {statusChangeError}
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
            {nextAppointments.length === 0 && (
              <StateMessage title="Nenhum próximo agendamento" />
            )}
            <div className="stack">
              {nextAppointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Serviços</h2>
            {safeServices.length === 0 && (
              <StateMessage title="Carregando serviços…" />
            )}
            <div className="stack">
              {safeServices.map((s) => (
                <div className="compact-row" key={s.id}>
                  <strong>{s.name}</strong>
                  <span>{formatCurrency(s.price)} · {s.duration} min</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="admin-grid">
          <section className="panel">
            <h2>Todos os agendamentos</h2>
            {safeAppointments.length === 0 && (
              <StateMessage title="Nenhum agendamento cadastrado" />
            )}
            <div className="stack">
              {safeAppointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Profissionais</h2>
            {safeProfessionals.length === 0 && (
              <StateMessage title="Carregando profissionais…" />
            )}
            <div className="stack">
              {safeProfessionals.map((p) => (
                <div className="compact-row" key={p.id}>
                  <strong>{p.name}</strong>
                  <span>{p.specialty}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
