import React, { useEffect, useState } from "react";
import { api, apiMode } from "../services/api.js";
import tenant, { adminPath } from "../config/tenant.js";
import { verticalConfig } from "../config/verticals.js";
import PanelShell, { moduleGroups } from "../components/panel/PanelShell.jsx";
import Overview from "./admin/Overview.jsx";
import Agenda from "./admin/Agenda.jsx";
import Leads from "./admin/Leads.jsx";
import Clients from "./admin/Clients.jsx";
import FollowUps from "./admin/FollowUps.jsx";
import Services from "./admin/Services.jsx";
import Professionals from "./admin/Professionals.jsx";
import Availability from "./admin/Availability.jsx";
import Blocks from "./admin/Blocks.jsx";
import Metrics from "./admin/Metrics.jsx";
import Settings from "./admin/Settings.jsx";

// Constante de build: no destino Cloudflare os ramos de senha e sessão própria
// viram código morto e saem do bundle administrativo.
const isCloudflare = apiMode === "cloudflare";

const moduleIds = moduleGroups.flatMap((group) => group.modules);

// O rótulo muda por vertical; o identificador na URL, não.
function moduleLabels(vertical) {
  return {
    "visao-geral": "Visão geral",
    agenda: "Agenda",
    leads: "Leads",
    clientes: "Clientes",
    "follow-ups": "Follow-ups",
    servicos: vertical.servicePlural,
    profissionais: vertical.professionalPlural,
    disponibilidade: "Horários",
    bloqueios: "Bloqueios",
    indicadores: "Indicadores",
    configuracoes: "Configurações"
  };
}

// Subtítulo curto por módulo — dá hierarquia consistente ao topo de cada tela
// sem repetir o que a sidebar/topbar já dizem.
function moduleSubtitles(vertical) {
  return {
    "visao-geral": "Resumo operacional do dia",
    agenda: "Atendimentos e disponibilidade do dia",
    leads: "Oportunidades em acompanhamento",
    clientes: "Base de clientes e histórico",
    "follow-ups": "Contatos e tarefas pendentes",
    servicos: `Catálogo de ${vertical.servicePlural?.toLowerCase?.() || "serviços"}`,
    profissionais: "Equipe e suas agendas",
    disponibilidade: "Grade de horários da equipe",
    bloqueios: "Pausas e indisponibilidades",
    indicadores: "Desempenho do período",
    configuracoes: "Preferências do negócio"
  };
}

function initialModule() {
  const requested = new URLSearchParams(window.location.search).get("m");
  return moduleIds.includes(requested) ? requested : "visao-geral";
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

// ─── Telas do Cloudflare Access ─────────────────────────────────────────────
// Não há login, senha nem sessão própria: a identidade chega verificada pelo
// Access e o Worker só confirma a membership do slug pedido na rota.

function AccessExpiredScreen() {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Sessão expirada</h2>
      <p className="admin-screen-message">
        Sua sessão do Cloudflare Access terminou.<br />
        Recarregue para autenticar de novo — você volta para esta mesma tela.
      </p>
      <button className="admin-screen-btn" type="button" onClick={() => window.location.reload()}>
        Entrar novamente
      </button>
    </AdminScreen>
  );
}

function NoMembershipScreen({ memberships }) {
  const others = memberships.filter((membership) => membership.tenantId !== tenant.slug);

  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">
        {others.length ? "Painel incorreto" : "Sem acesso a este painel"}
      </h2>
      <p className="admin-screen-message">
        {others.length
          ? "Sua identidade não opera este negócio, mas tem acesso aos painéis abaixo."
          : "Sua identidade está autenticada, mas nenhum painel está autorizado para ela. Peça liberação a quem administra o Access."}
      </p>
      {others.map((membership) => (
        <a key={membership.tenantId} className="admin-screen-btn" href={`/${membership.tenantId}/admin`}>
          Ir para {membership.tenantName}
        </a>
      ))}
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
  const [catalog, setCatalog] = useState(null);
  const [foreignTenant, setForeignTenant] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [module, setModule] = useState(initialModule);
  const [params, setParams] = useState({});
  const [expiredNotice, setExpiredNotice] = useState("");

  const vertical = verticalConfig(tenant.slug);
  const labels = moduleLabels(vertical);
  const subtitles = moduleSubtitles(vertical);

  // O catálogo administrativo inclui inativos; as listas públicas recebidas por
  // prop só têm ativos e servem de fallback até a primeira carga.
  async function loadCatalog() {
    const [servicePage, professionalPage] = await Promise.all([
      api.getAdminServices({ limit: 50 }),
      api.getAdminProfessionals({ limit: 50 })
    ]);
    setCatalog({ services: servicePage.items, professionals: professionalPage.items });
  }

  const safeServices = catalog?.services || (Array.isArray(services) ? services : []);
  const safeProfessionals = catalog?.professionals || (Array.isArray(professionals) ? professionals : []);

  async function bootstrapAccess() {
    try {
      const context = await api.adminContext();
      setSession({ ...context.identity, tenantId: context.tenant.slug });
      setMemberships(context.memberships || []);
      setUsers(await api.getAdminUsers());
      await loadCatalog();
      setStatus("ready");
    } catch (failure) {
      if (failure.status === 401) {
        setStatus("access-expired");
        return;
      }
      if (failure.status === 403 || failure.status === 404) {
        // 403 e 404 são o mesmo fato para quem opera: este painel não é dela.
        const identity = await api.adminIdentity().catch(() => null);
        setMemberships(identity?.memberships || []);
        setStatus("no-membership");
        return;
      }
      setStatus("unavailable");
    }
  }

  function bootstrap() {
    setStatus("loading");
    setForeignTenant(null);

    if (isCloudflare) {
      bootstrapAccess();
      return;
    }

    api.adminMe()
      .then(async (me) => {
        if (me.tenantId !== tenant.slug) {
          setForeignTenant(me.tenantId);
          setStatus("foreign");
          return;
        }
        setSession(me);
        setUsers(await api.getAdminUsers());
        await loadCatalog();
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
    if (isCloudflare) {
      setStatus("access-expired");
      return;
    }
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
  if (status === "access-expired") return <AccessExpiredScreen />;
  if (status === "no-membership") return <NoMembershipScreen memberships={memberships} />;
  if (!isCloudflare && status === "unauthenticated") return <LoginScreen onSuccess={bootstrap} notice={expiredNotice} />;
  if (!isCloudflare && status === "foreign") return <ForeignTenantScreen tenantId={foreignTenant} onLogout={handleLogout} />;
  if (status === "unavailable") return <UnavailableScreen onRetry={bootstrap} />;

  const moduleProps = {
    tenantId: tenant.slug,
    vertical,
    services: safeServices,
    professionals: safeProfessionals,
    users,
    params,
    onNavigate: navigate,
    onSessionExpired: handleSessionExpired,
    onCatalogChange: () => loadCatalog().catch(() => {})
  };

  const profileActions = isCloudflare
    ? null
    : <button className="panel-sidebar-logout" type="button" onClick={handleLogout}>Sair</button>;

  return (
    <PanelShell
      brand={tenant.name}
      brandMark={tenant.logo?.mark || tenant.name.charAt(0)}
      subtitle="Painel admin"
      currentLabel={labels[module]}
      pageSubtitle={subtitles[module]}
      profileName={session?.name}
      profileMeta={isCloudflare ? session?.email : "Administrador"}
      profileActions={profileActions}
      labels={labels}
      current={module}
      onSelect={(id) => navigate(id)}
    >
      <div key={`${module}:${JSON.stringify(params)}`}>
        {module === "visao-geral" && <Overview {...moduleProps} />}
        {module === "agenda" && <Agenda {...moduleProps} />}
        {module === "leads" && <Leads {...moduleProps} />}
        {module === "clientes" && <Clients {...moduleProps} />}
        {module === "follow-ups" && <FollowUps {...moduleProps} />}
        {module === "servicos" && <Services {...moduleProps} />}
        {module === "profissionais" && <Professionals {...moduleProps} />}
        {module === "disponibilidade" && <Availability {...moduleProps} />}
        {module === "bloqueios" && <Blocks {...moduleProps} />}
        {module === "indicadores" && <Metrics {...moduleProps} />}
        {module === "configuracoes" && <Settings {...moduleProps} />}
      </div>
    </PanelShell>
  );
}
