import React, { useEffect, useState } from "react";

export default function Navbar({ onNavigate }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`navbar${scrolled ? " scrolled" : ""}`}>
      <button className="navbar-brand" onClick={() => onNavigate("home")}>
        <span className="navbar-brand-name">AgendaFácil</span>
        <span className="navbar-brand-demo">· Demo Studio Cut</span>
      </button>
      <button className="navbar-cta" type="button" onClick={() => onNavigate("home")}>
        Agendar agora
      </button>
    </header>
  );
}
