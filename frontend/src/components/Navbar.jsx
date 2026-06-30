import React, { useEffect, useState } from "react";
import tenant from "../config/tenant.js";

export default function Navbar({ onNavigate }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() { setScrolled(window.scrollY > 20); }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`navbar${scrolled ? " scrolled" : ""}`}>
      <button className="navbar-brand" onClick={() => onNavigate("home")}>
        <span className="navbar-platform">AgendaFácil</span>
        <span className="navbar-brand-demo">Demonstração</span>
        <span className="navbar-brand-name">{tenant.name}</span>
      </button>
      <nav className="demo-switcher" aria-label="Demonstrações AgendaFácil">
        <a className={tenant.slug === "studio-cut" ? "active" : ""} href="/demo/studio-cut">Studio Cut</a>
        <a className={tenant.slug === "lumiere" ? "active" : ""} href="/demo/lumiere">Lumière</a>
      </nav>
    </header>
  );
}
