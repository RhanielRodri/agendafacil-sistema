import React, { useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import Success from "./pages/Success.jsx";
import { SERVICES, PROFESSIONALS } from "./data/mock.js";

function getInitialPage() {
  return window.location.pathname === "/admin" ? "admin" : "home";
}

export default function App() {
  const [page, setPage] = useState(getInitialPage);
  const [services] = useState(SERVICES);
  const [professionals] = useState(PROFESSIONALS);
  const [loading] = useState(false);
  const [error] = useState("");
  const [successAppointment, setSuccessAppointment] = useState(null);

  function loadData() {}

  function navigate(nextPage) {
    setSuccessAppointment(null);
    setPage(nextPage);
    window.history.pushState({}, "", nextPage === "admin" ? "/admin" : "/");
  }

  function handleSuccess(appointment) {
    setSuccessAppointment(appointment);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (successAppointment) {
    return <Success appointment={successAppointment} onBack={() => navigate("home")} />;
  }

  return (
    <>
      <Navbar onNavigate={navigate} />
      {page === "admin" ? (
        <Admin services={services} professionals={professionals} />
      ) : (
        <Home
          services={services}
          professionals={professionals}
          loading={loading}
          error={error}
          onSuccess={handleSuccess}
          onRetry={loadData}
        />
      )}
    </>
  );
}
