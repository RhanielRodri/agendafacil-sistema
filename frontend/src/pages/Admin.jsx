import React, { useEffect, useState } from "react";
import { api } from "../services/api.js";
import tenant, { adminPath } from "../config/tenant.js";
import { verticalConfig } from "../config/verticals.js";
import Overview from "./admin/Overview.jsx";
import Agenda from "./admin/Agenda.jsx";
import Leads from "./admin/Leads.jsx";
import Clients from "./admin/Clients.jsx";
import FollowUps from "./admin/FollowUps.jsx";
import Schedules from "./admin/Schedules.jsx";

const modules = [
  { id: "visao-geral", label: "Visão geral" },
  { id: "agenda", label: "Agenda" },
  { id: "leads", label: "Leads" },
  { id: "clientes", label: "Clientes" },
  { id: "follow-ups", label: "Follow-ups" },
  { id: "horarios", label: "Horários e bloqueios" }
];

function initialModule() {
  const requested = new URLSearchParams(window.location.search).get("m");
  return modules.some((module) => module.id === requested) ? requested : "visao-geral";
}

// ─── Telas de sessão (fundo escuro, card centralizado) ──────────────────────

function AdminScreenHeader() {
  return (
    <div className="admin-screen-header">
      <div className="admin-screen-brand">{tenant.name}</div>
      <span className="admin-screen-badge">Painel</span>
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

function LoginScreen({ onSuccess, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoginError("");
    setSubmitting(true);
    try {
      await api.adminLogin(email.trim(), password);
      onSuccess();
    } catch (failure) {
      setLoginError(failure.message || "Credenciais inválidas");
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
        {notice || "Área restrita para a operação diária do negócio."}
      </p>
      {loginError && <p className="admin-screen-error" role="alert">{loginError}</p>}
      <form onSubmit={handleSubmit}>
        <label className="admin-screen-label" htmlFor="admin-email">
          E-mail
          <div className="admin-screen-input-wrap">
            <svg className="admin-screen-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 6.5 10 11l6-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="admin-email"
              className="admin-screen-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
              required
              autoComplete="username"
              placeholder="voce@empresa.com"
            />
          </div>
        </label>
        <label className="admin-screen-label" htmlFor="admin-password">
          Senha de acesso
          <div className="admin-screen-input-wrap">
            <svg className="admin-screen-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="admin-password"
              className="admin-screen-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
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

function ForeignTenantScreen({ tenantId, onLogout }) {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Painel incorreto</h2>
      <p className="admin-screen-message">
        Sua sessão pertence a outro negócio. Acesse o painel correto para continuar.
      </p>
      <a className="admin-screen-btn" href={`/${tenantId}/admin`}>Ir para o painel correto</a>
      <button
        className="admin-screen-btn"
        type="button"
        onClick={onLogout}
        style={{ marginTop: 8, background: "none", border: "1px solid var(--border-dark)" }}
      >
        Sair desta sessão
      </button>
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
        O painel está temporariamente indisponível.<br />Tente novamente em instantes.
      </p>
      <button className="admin-screen-btn" type="button" onClick={onRetry}>Tentar novamente</button>
    </AdminScreen>
  );
}

// ─── Painel ─────────────────────────────────────────────────────────────────

export default function Admin({ services, professionals }) {
  const [status, setStatus] = useState("loading");
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [foreignTenant, setForeignTenant] = useState(null);
  const [module, setModule] = useState(initialModule);
  const [params, setParams] = useState({});
  const [expiredNotice, setExpiredNotice] = useState("");

  const safeServices = Array.isArray(services) ? services : [];
  const safeProfessionals = Array.isArray(professionals) ? professionals : [];
  const vertical = verticalConfig(tenant.slug);

  function bootstrap() {
    setStatus("loading");
    setForeignTenant(null);
    api.adminMe()
      .then(async (me) => {
        if (me.tenantId !== tenant.slug) {
          setForeignTenant(me.tenantId);
          setStatus("foreign");
          return;
        }
        setSession(me);
        setUsers(await api.getAdminUsers());
        setExpiredNotice("");
        setStatus("ready");
      })
      .catch((failure) => {
        setStatus(failure.status === 401 ? "unauthenticated" : "unavailable");
      });
  }

  useEffect(() => {
    bootstrap();
  }, []);

  function navigate(nextModule, nextParams = {}) {
    setModule(nextModule);
    setParams(nextParams);
    window.history.replaceState({}, "", `${adminPath}?m=${nextModule}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function handleSessionExpired() {
    setExpiredNotice("Sua sessão expirou. Entre novamente para continuar.");
    setStatus("unauthenticated");
  }

  function handleLogout() {
    api.adminLogout().finally(() => {
      setSession(null);
      setExpiredNotice("");
      setStatus("unauthenticated");
    });
  }

  if (status === "loading") return <LoadingScreen />;
  if (status === "unauthenticated") return <LoginScreen onSuccess={bootstrap} notice={expiredNotice} />;
  if (status === "foreign") return <ForeignTenantScreen tenantId={foreignTenant} onLogout={handleLogout} />;
  if (status === "unavailable") return <UnavailableScreen onRetry={bootstrap} />;

  const moduleProps = {
    tenantId: tenant.slug,
    vertical,
    services: safeServices,
    professionals: safeProfessionals,
    users,
    params,
    onNavigate: navigate,
    onSessionExpired: handleSessionExpired
  };

  return (
    <div className="panel-shell">
      <header className="panel-topbar">
        <div className="panel-topbar-brand">
          <strong>{tenant.name}</strong>
          <span>Painel operacional</span>
        </div>
        <div className="panel-topbar-actions">
          {session?.name && <span className="panel-topbar-user">{session.name}</span>}
          <button className="panel-ghost-dark" type="button" onClick={handleLogout}>Sair</button>
        </div>
      </header>

      <nav className="panel-nav" aria-label="Módulos do painel">
        {modules.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={module === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="panel-main" key={`${module}:${JSON.stringify(params)}`}>
        {module === "visao-geral" && <Overview {...moduleProps} />}
        {module === "agenda" && <Agenda {...moduleProps} />}
        {module === "leads" && <Leads {...moduleProps} />}
        {module === "clientes" && <Clients {...moduleProps} />}
        {module === "follow-ups" && <FollowUps {...moduleProps} />}
        {module === "horarios" && <Schedules {...moduleProps} />}
      </main>
    </div>
  );
}
