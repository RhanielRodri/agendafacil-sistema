import React, { useEffect, useRef, useState } from "react";

// Onze itens em faixa horizontal não cabem em tela pequena e não dizem a que
// cada módulo serve. O agrupamento é por finalidade operacional; os ids das
// rotas continuam iguais, então os deep links existentes seguem válidos.
export const moduleGroups = [
  { id: "principal", label: "Principal", modules: ["visao-geral", "agenda"] },
  { id: "relacionamento", label: "Relacionamento", modules: ["leads", "clientes", "follow-ups"] },
  { id: "estrutura", label: "Estrutura", modules: ["servicos", "profissionais"] },
  { id: "disponibilidade", label: "Disponibilidade", modules: ["disponibilidade", "bloqueios"] },
  { id: "analise", label: "Análise", modules: ["indicadores"] },
  { id: "sistema", label: "Sistema", modules: ["configuracoes"] }
];

// Ícones lineares finos, um por módulo — a referência é icônica, não só texto.
// Traço fino (1.6) sobre corrente, sem preenchimento, para ler na sidebar café.
const ICONS = {
  "visao-geral": <><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><rect x="14" y="14" width="7" height="7" rx="1.4" /></>,
  agenda: <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9h17M8 3v3M16 3v3" /></>,
  leads: <path d="M3 13.5l4.5-5 3.5 3.5 5-6L21 8" />,
  clientes: <><circle cx="8.5" cy="8" r="3" /><path d="M3 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.2a3 3 0 0 1 0 5.6M21 20c0-2.6-1.7-4.4-4-4.8" /></>,
  "follow-ups": <path d="M4 5.5h16v10H9l-5 4v-4H4z" />,
  servicos: <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />,
  profissionais: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.4 3-6 6.5-6s6.5 2.6 6.5 6" /></>,
  disponibilidade: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.4 2" /></>,
  bloqueios: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
  indicadores: <><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7.5" y="12" width="3" height="5" /><rect x="13.5" y="8" width="3" height="9" /></>,
  configuracoes: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.6M12 18.9v2.6M4.2 7.2l2.2 1.3M17.6 15.5l2.2 1.3M4.2 16.8l2.2-1.3M17.6 8.5l2.2-1.3" /></>
};

function ModuleIcon({ id }) {
  return (
    <svg className="panel-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id] || <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function NavGroups({ labels, current, onSelect, scope }) {
  return (
    <>
      {moduleGroups.map((group) => (
        <div className="panel-nav-group" key={group.id}>
          <p className="panel-nav-group-label" id={`panel-nav-${scope}-${group.id}`}>{group.label}</p>
          <ul className="panel-nav-list" aria-labelledby={`panel-nav-${scope}-${group.id}`}>
            {group.modules.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className="panel-nav-item"
                  aria-current={current === id ? "page" : undefined}
                  onClick={() => onSelect(id)}
                >
                  <ModuleIcon id={id} />
                  <span>{labels[id]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function SidebarLogo({ brand, brandMark, subtitle, symbol }) {
  return (
    <div className="panel-sidebar-logo">
      <span className={`panel-sidebar-mark${symbol ? " is-symbol" : ""}`} aria-hidden="true">{brandMark}</span>
      <span className="panel-sidebar-logo-text">
        <strong>{brand}</strong>
        <small>{subtitle}</small>
      </span>
    </div>
  );
}

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PanelShell({
  brand, brandMark, subtitle, symbol = false, breadcrumbRoot = "Admin",
  currentLabel, pageSubtitle, profileName, profileMeta, profileActions,
  labels, current, onSelect, children
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const drawer = drawerRef.current;
    drawer?.querySelector(FOCUSABLE)?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;

      const focusable = [...drawer.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("panel-drawer-open");
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("panel-drawer-open");
    };
  }, [drawerOpen]);

  function select(id) {
    setDrawerOpen(false);
    onSelect(id);
  }

  const avatarInitial = (profileName || brand || "?").trim().charAt(0).toUpperCase();

  const profileFooter = (
    <div className="panel-sidebar-profile">
      <span className="panel-sidebar-avatar" aria-hidden="true">{avatarInitial}</span>
      <span className="panel-sidebar-profile-text">
        <strong>{profileName || brand}</strong>
        {profileMeta && <small>{profileMeta}</small>}
      </span>
      {profileActions && <div className="panel-sidebar-profile-actions">{profileActions}</div>}
    </div>
  );

  return (
    <div className="panel-shell">
      <aside className="panel-sidebar" aria-label="Módulos do painel">
        <SidebarLogo brand={brand} brandMark={brandMark} subtitle={subtitle} symbol={symbol} />
        <nav className="panel-sidebar-nav" aria-label="Navegação do painel">
          <NavGroups labels={labels} current={current} onSelect={select} scope="sidebar" />
        </nav>
        {profileFooter}
      </aside>

      {drawerOpen && (
        <div
          className="panel-drawer-backdrop"
          role="presentation"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <nav
        className={`panel-drawer${drawerOpen ? " is-open" : ""}`}
        id="panel-drawer"
        ref={drawerRef}
        aria-label="Módulos do painel"
        aria-hidden={drawerOpen ? undefined : "true"}
        {...(drawerOpen ? { role: "dialog", "aria-modal": "true" } : {})}
      >
        <SidebarLogo brand={brand} brandMark={brandMark} subtitle={subtitle} symbol={symbol} />
        <button className="panel-drawer-close" type="button" onClick={() => {
          setDrawerOpen(false);
          triggerRef.current?.focus();
        }}>
          Fechar
        </button>
        <div className="panel-sidebar-nav">
          <NavGroups labels={labels} current={current} onSelect={select} scope="drawer" />
        </div>
        {profileFooter}
      </nav>

      <div className="panel-main-col">
        <header className="panel-topbar">
          <button
            className="panel-drawer-trigger"
            type="button"
            ref={triggerRef}
            aria-expanded={drawerOpen}
            aria-controls="panel-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <span aria-hidden="true">☰</span>
            <span className="sr-only">Abrir menu do painel</span>
          </button>
          <nav className="panel-breadcrumb" aria-label="Você está em">
            <span className="panel-breadcrumb-root">{breadcrumbRoot}</span>
            <span className="panel-breadcrumb-sep" aria-hidden="true">/</span>
            <span className="panel-breadcrumb-current" aria-current="page">{currentLabel}</span>
          </nav>
          <span className="panel-topbar-date">{todayLabel()}</span>
        </header>

        <main className="panel-main">
          <header className="panel-context">
            <div>
              <h1>{currentLabel}</h1>
              {pageSubtitle && (
                <p className="panel-context-meta"><span>{pageSubtitle}</span></p>
              )}
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
