import React from "react";

export default function Navbar({ page, onNavigate }) {
  return (
    <header className="navbar">
      <button className="brand" onClick={() => onNavigate("home")}>
        Studio Cut
      </button>
      <nav>
        <button onClick={() => onNavigate("home")} className={page === "home" ? "active" : ""}>
          Agendar
        </button>
        <button onClick={() => onNavigate("admin")} className={page === "admin" ? "active" : ""}>
          Admin
        </button>
      </nav>
    </header>
  );
}
