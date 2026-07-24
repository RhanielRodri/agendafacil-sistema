import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// Ações de linha em tabelas densas (Procedimentos, Profissionais) somam cinco a
// sete botões e transbordam. Aqui as principais ficam sempre visíveis e as
// secundárias entram num disclosure "Mais ações". O menu é posicionado com
// `position: fixed` a partir do retângulo do gatilho porque a `.panel-list` tem
// `overflow-x: auto`/`overflow-y: hidden` e recortaria um popover no fluxo.
//
// O agrupamento só vale onde a densidade é da identidade Lumière; nas demais
// verticais as ações continuam lado a lado, sem alterar o comportamento aprovado.
function isCompact() {
  return typeof document !== "undefined" && document.documentElement.dataset.demo === "lumiere";
}

function ActionButton({ action }) {
  return (
    <button
      type="button"
      className={action.className || "panel-btn"}
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={action.ariaLabel}
    >
      {action.label}
    </button>
  );
}

export default function RowActions({ primary = [], secondary = [] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const compact = isCompact();
  const visibleSecondary = secondary.filter(Boolean);

  // Sem agrupamento (outras verticais) ou sem secundárias: tudo inline, exatamente
  // como antes.
  if (!compact || visibleSecondary.length === 0) {
    return (
      <div className="panel-row-actions">
        {primary.filter(Boolean).map((action) => <ActionButton key={action.key} action={action} />)}
        {visibleSecondary.map((action) => <ActionButton key={action.key} action={action} />)}
      </div>
    );
  }

  function place() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    // Reposicionar é caro e o popover é efêmero: rolar ou redimensionar fecha.
    function onReflow() { setOpen(false); }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  function runAction(action) {
    setOpen(false);
    action.onClick?.();
  }

  return (
    <div className="panel-row-actions">
      {primary.filter(Boolean).map((action) => <ActionButton key={action.key} action={action} />)}
      <button
        type="button"
        className="panel-btn panel-row-more"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Mais ações<span aria-hidden="true" className="panel-row-more-caret">▾</span>
      </button>
      {open && coords && (
        <div
          className="panel-row-menu"
          role="menu"
          ref={menuRef}
          style={{ top: coords.top, right: coords.right }}
        >
          {visibleSecondary.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              className={`panel-row-menu-item${action.danger ? " is-danger" : ""}`}
              onClick={() => runAction(action)}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
