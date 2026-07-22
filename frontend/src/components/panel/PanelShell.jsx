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
                  {labels[id]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export default function PanelShell({ brand, subtitle, identity, labels, current, onSelect, children }) {
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

  return (
    <div className="panel-shell">
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
        <div className="panel-topbar-brand">
          <strong>{brand}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="panel-topbar-actions">{identity}</div>
      </header>

      <div className="panel-body">
        <nav className="panel-sidebar" aria-label="Módulos do painel">
          <NavGroups labels={labels} current={current} onSelect={select} scope="sidebar" />
        </nav>

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
          <div className="panel-drawer-head">
            <strong>{brand}</strong>
            <button className="panel-btn" type="button" onClick={() => {
              setDrawerOpen(false);
              triggerRef.current?.focus();
            }}>
              Fechar
            </button>
          </div>
          <NavGroups labels={labels} current={current} onSelect={select} scope="drawer" />
        </nav>

        <main className="panel-main">{children}</main>
      </div>
    </div>
  );
}
