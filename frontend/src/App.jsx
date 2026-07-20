import React, { useEffect, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import Success from "./pages/Success.jsx";
import PlatformLanding from "./pages/PlatformLanding.jsx";
import { api } from "./services/api.js";
import tenant, { adminPath, currentRoute, homePath, isNeutralRoute } from "./config/tenant.js";
import { applyMetadata, rootMetadata } from "./utils/metadata.js";

export default function App() {
  const [page, setPage] = useState(currentRoute.page);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(!isNeutralRoute);
  const [error, setError] = useState("");
  const [successAppointment, setSuccessAppointment] = useState(null);

  function loadData() {
    if (!tenant) return;

    setLoading(true);
    setError("");
    Promise.all([api.getServices(), api.getProfessionals()])
      .then(([servicesData, professionalsData]) => {
        setServices(servicesData);
        setProfessionals(professionalsData);
      })
      .catch(() => setError("unavailable"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!tenant) {
      applyMetadata(rootMetadata);
      return;
    }

    const isAdmin = page === "admin";
    applyMetadata({
      ...tenant.metadata,
      title: isAdmin ? `${tenant.name} | Painel administrativo` : tenant.metadata.title,
      canonical: isAdmin ? `${window.location.origin}${adminPath}` : tenant.metadata.canonical,
      mark: tenant.logo.mark,
      background: tenant.logo.background,
      foreground: tenant.logo.foreground,
      siteName: tenant.name
    });
    loadData();
  }, []);

  function navigate(nextPage) {
    if (!tenant) return;

    setSuccessAppointment(null);
    setPage(nextPage);
    window.history.pushState({}, "", nextPage === "admin" ? adminPath : homePath);
  }

  function handleSuccess(appointment) {
    setSuccessAppointment(appointment);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (isNeutralRoute || page === "neutral") {
    return <PlatformLanding />;
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
