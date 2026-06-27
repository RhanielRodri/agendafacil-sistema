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
        <span className="navbar-brand-name">{tenant.name}</span>
      </button>
    </header>
  );
}
