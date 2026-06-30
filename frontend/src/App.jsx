import React, { useEffect, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import Success from "./pages/Success.jsx";
import PlatformLanding from "./pages/PlatformLanding.jsx";
import { api } from "./services/api.js";
import tenant, { adminPath, demoPath, isPlatformLanding } from "./config/tenant.js";
import { applyMetadata, platformMetadata } from "./utils/metadata.js";

function getInitialPage() {
  if (isPlatformLanding) return "landing";
  return window.location.pathname.endsWith("/admin") ? "admin" : "home";
}

export default function App() {
  const [page, setPage] = useState(getInitialPage);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successAppointment, setSuccessAppointment] = useState(null);

  function loadData() {
    setLoading(true);
    setError("");
    Promise.all([api.getServices(), api.getProfessionals()])
      .then(([servicesData, professionalsData]) => {
        setServices(servicesData);
        setProfessionals(professionalsData);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const metadata = isPlatformLanding
      ? platformMetadata
      : {
          ...tenant.metadata,
          title: page === "admin" ? `${tenant.name} | Painel administrativo` : tenant.metadata.title,
          mark: tenant.logo.mark,
          background: tenant.logo.background,
          foreground: tenant.logo.foreground,
          siteName: tenant.name
        };

    applyMetadata(metadata);
    if (!isPlatformLanding) loadData();
  }, []);

  function navigate(nextPage) {
    setSuccessAppointment(null);
    setPage(nextPage);
    window.history.pushState({}, "", nextPage === "admin" ? adminPath : demoPath);
  }

  function handleSuccess(appointment) {
    setSuccessAppointment(appointment);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (successAppointment) {
    return <Success appointment={successAppointment} onBack={() => navigate("home")} />;
  }

  if (page === "landing") {
    return <PlatformLanding />;
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
