import React, { useEffect, useRef, useState } from "react";
import tenant from "../config/site.js";
import BrandMark from "./BrandMark.jsx";

function scrollToHash(href) {
  const id = href.replace(/^#/, "");
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState({}, "", href);
}

export default function Navbar({ onNavigate }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const drawerRef = useRef(null);
  const links = tenant.nav || [];

  useEffect(() => {
    function handleScroll() { setScrolled(window.scrollY > 20); }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = "hidden";
    const previous = document.activeElement;
    drawerRef.current?.querySelector("a, button")?.focus();

    function handleKey(event) {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll("a[href], button:not([disabled])");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open]);

  function goHome() {
    setOpen(false);
    onNavigate("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleLink(event, href) {
    event.preventDefault();
    setOpen(false);
    scrollToHash(href);
  }

  function handleCta() {
    setOpen(false);
    scrollToHash("#agendamento");
  }

  return (
    <header className={`navbar${scrolled ? " scrolled" : ""}`} id="topo">
      <button className="navbar-brand" onClick={goHome} aria-label={`${tenant.name} — início`}>
        {tenant.brandSymbol
          ? <BrandMark className="navbar-brand-mark" size={36} />
          : <span className="navbar-brand-mark" aria-hidden="true">{tenant.logo.mark}</span>}
        <span className="navbar-brand-name">{tenant.wordmark || tenant.name}</span>
      </button>

      <nav className="navbar-links" aria-label="Seções do site">
        {links.map((link) => (
          <a key={link.href} href={link.href} onClick={(event) => handleLink(event, link.href)}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="navbar-actions">
        <button className="primary-button navbar-cta" type="button" onClick={handleCta}>
          {tenant.hero.primaryCta}
        </button>
        <button
          ref={toggleRef}
          className="navbar-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="navbar-drawer"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>
      </div>

      {open && <div className="navbar-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div
        id="navbar-drawer"
        ref={drawerRef}
        className={`navbar-drawer${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        hidden={!open}
      >
        <nav className="navbar-drawer-links" aria-label="Seções do site">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={(event) => handleLink(event, link.href)}>
              {link.label}
            </a>
          ))}
        </nav>
        <button className="primary-button navbar-drawer-cta" type="button" onClick={handleCta}>
          {tenant.hero.primaryCta}
        </button>
      </div>
    </header>
  );
}
