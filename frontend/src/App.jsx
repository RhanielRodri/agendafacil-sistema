import React, { useEffect, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import Success from "./pages/Success.jsx";
import PlatformLanding from "./pages/PlatformLanding.jsx";
import ManageAppointment from "./pages/ManageAppointment.jsx";
import { api } from "./services/api.js";
import tenant, { adminPath, currentRoute, homePath, isNeutralRoute, surface } from "./config/tenant.js";
import site from "./config/site.js";
import { applyMetadata, rootMetadata } from "./utils/metadata.js";

export default function App() {
  const initialManagementToken = new URLSearchParams(window.location.hash.slice(1)).get("agendamento") || "";
  const [managementToken, setManagementToken] = useState(initialManagementToken);
  const [page, setPage] = useState(managementToken ? "manage" : currentRoute.page);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(!isNeutralRoute && surface !== "admin");
  const [error, setError] = useState("");
  const [successAppointment, setSuccessAppointment] = useState(null);

  // No Worker administrativo não existe catálogo público: o painel carrega o
  // seu próprio catálogo, que também inclui inativos.
  function loadData() {
    if (!tenant || surface === "admin") return;

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
    const useStudioCutAdminBrand = isAdmin && tenant.slug === "studio-cut";
    const activeMetadata = isAdmin && !useStudioCutAdminBrand ? tenant.metadata : site.metadata;
    const activeLogo = isAdmin && !useStudioCutAdminBrand ? tenant.logo : site.logo;
    applyMetadata({
      ...activeMetadata,
      title: isAdmin ? `${tenant.name} | Painel administrativo` : activeMetadata.title,
      canonical: isAdmin ? `${window.location.origin}${adminPath}` : activeMetadata.canonical,
      mark: activeLogo.mark,
      background: activeLogo.background,
      foreground: activeLogo.foreground,
      siteName: tenant.name
    });
    loadData();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.pageSurface = page === "admin" ? "admin" : "public";
    return () => {
      delete document.documentElement.dataset.pageSurface;
    };
  }, [page]);

  useEffect(() => {
    function syncManagementRoute() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("agendamento") || "";
      setManagementToken(token);
      if (token) setPage("manage");
    }

    window.addEventListener("hashchange", syncManagementRoute);
    window.addEventListener("popstate", syncManagementRoute);
    return () => {
      window.removeEventListener("hashchange", syncManagementRoute);
      window.removeEventListener("popstate", syncManagementRoute);
    };
  }, []);

  function navigate(nextPage) {
    if (!tenant) return;

    setSuccessAppointment(null);
    setManagementToken("");
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

  if (page === "manage") {
    return (
      <ManageAppointment
        token={managementToken}
        professionals={professionals}
        onBack={() => navigate("home")}
      />
    );
  }

  // O painel tem barra própria; a navegação pública não aparece dentro dele.
  if (page === "admin") {
    return <Admin services={services} professionals={professionals} />;
  }

  return (
    <>
      <Navbar onNavigate={navigate} />
      <Home
        services={services}
        professionals={professionals}
        loading={loading}
        error={error}
        onSuccess={handleSuccess}
        onRetry={loadData}
      />
    </>
  );
}
