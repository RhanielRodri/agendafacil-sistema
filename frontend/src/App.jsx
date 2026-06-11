import React, { useEffect, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import Success from "./pages/Success.jsx";
import { api } from "./services/api.js";

function getInitialPage() {
  return window.location.pathname === "/admin" ? "admin" : "home";
}

export default function App() {
  const [page, setPage] = useState(getInitialPage);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successAppointment, setSuccessAppointment] = useState(null);

  useEffect(() => {
    Promise.all([api.getServices(), api.getProfessionals()])
      .then(([servicesData, professionalsData]) => {
        setServices(servicesData);
        setProfessionals(professionalsData);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

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
      <Navbar page={page} onNavigate={navigate} />
      {page === "admin" ? (
        <Admin services={services} professionals={professionals} />
      ) : (
        <Home services={services} professionals={professionals} loading={loading} error={error} onSuccess={handleSuccess} />
      )}
    </>
  );
}
