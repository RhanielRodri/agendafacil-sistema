import React, { useEffect, useState } from "react";
import { useTranslation } from "../i18n/I18nContext.jsx";

function LangToggle() {
  const { locale, setLocale } = useTranslation();
  const activeStyle = { fontWeight: "800", color: "currentColor" };
  const inactiveStyle = { fontWeight: "600", opacity: 0.35, cursor: "pointer" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", letterSpacing: "0.05em" }}>
      <button type="button" onClick={() => setLocale("pt")} style={locale === "pt" ? activeStyle : inactiveStyle} aria-pressed={locale === "pt"}>PT</button>
      <span style={{ opacity: 0.2 }}>|</span>
      <button type="button" onClick={() => setLocale("en")} style={locale === "en" ? activeStyle : inactiveStyle} aria-pressed={locale === "en"}>EN</button>
    </div>
  );
}

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
        <span className="navbar-brand-name">STUDIO<span style={{ color: "var(--text-muted)", fontWeight: 400 }}>CUT</span></span>
      </button>
      <nav style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <LangToggle />
      </nav>
    </header>
  );
}
