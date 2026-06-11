import React, { useState } from "react";
import BookingFlow from "./BookingFlow.jsx";
import { formatCurrency } from "../utils/format.js";
import StateMessage from "../components/StateMessage.jsx";

export default function Home({ services, professionals, loading, error, onSuccess }) {
  const [selectedServiceFromHome, setSelectedServiceFromHome] = useState("");

  function handleServiceSelect(serviceId) {
    setSelectedServiceFromHome(String(serviceId));
    document.getElementById("agendamento")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleStartBooking() {
    document.getElementById("agendamento")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">AgendaFácil para barbearias</span>
          <h1>Studio Cut</h1>
          <p>Agende seu horário em segundos, sem ligação, sem espera.</p>
          <button className="primary-link" type="button" onClick={handleStartBooking}>Agendar agora</button>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <span>Serviços</span>
          <h2>Escolha o cuidado certo para hoje</h2>
        </div>
        {loading && <StateMessage type="loading" title="Carregando serviços" />}
        {error && <StateMessage type="error" title="Erro ao carregar dados">{error}</StateMessage>}
        {!loading && !error && services.length === 0 && <StateMessage title="Nenhum serviço ativo" />}
        <div className="grid three">
          {services.map((service) => (
            <button
              className={selectedServiceFromHome === String(service.id) ? "service-card selected" : "service-card"}
              key={service.id}
              type="button"
              onClick={() => handleServiceSelect(service.id)}
            >
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              <div>
                <strong>{formatCurrency(service.price)}</strong>
                <span>{service.duration} min</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="section muted">
        <div className="section-heading">
          <span>Profissionais</span>
          <h2>Time Studio Cut</h2>
        </div>
        <div className="grid three">
          {professionals.map((professional) => (
            <article className="professional-card" key={professional.id}>
              <img src={professional.photo} alt={professional.name} />
              <div>
                <h3>{professional.name}</h3>
                <p>{professional.specialty}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <BookingFlow
        services={services}
        professionals={professionals}
        initialServiceId={selectedServiceFromHome}
        onSuccess={onSuccess}
      />

      <section className="section">
        <div className="section-heading">
          <span>Depoimentos</span>
          <h2>Clientes que já agilizaram a rotina</h2>
        </div>
        <div className="grid three">
          <blockquote>"Marquei pelo celular e cheguei no horário certo. Muito prático."</blockquote>
          <blockquote>"O painel deixa tudo organizado, sem conversa perdida no WhatsApp."</blockquote>
          <blockquote>"O Studio Cut ficou mais rápido para atender e confirmar horários."</blockquote>
        </div>
      </section>

      <footer className="footer">
        <strong>Studio Cut</strong>
        <span>AgendaFácil V1 para pequenos negócios.</span>
      </footer>
    </main>
  );
}
