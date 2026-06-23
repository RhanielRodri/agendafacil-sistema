import React, { useState } from "react";
import BookingFlow from "./BookingFlow.jsx";
import { formatCurrency } from "../utils/format.js";
import StateMessage from "../components/StateMessage.jsx";

function ProfessionalPhoto({ src, name }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  if (failed || !src) {
    return (
      <div className="professional-avatar" aria-hidden="true">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
    />
  );
}

export default function Home({ services, professionals, loading, error, onSuccess, onRetry }) {
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
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">Plataforma de agendamento online</span>
            <h1>Seu cliente agenda em segundos. Você organiza tudo em um painel.</h1>
            <p className="hero-sub">
              Veja como funciona com a Studio Cut — uma barbearia configurada como demonstração.
            </p>
            <button className="primary-button" type="button" onClick={handleStartBooking}>
              Agendar agora
            </button>
            <p className="hero-perks">Sem ligação · Sem espera · Painel incluso</p>
          </div>

          <aside className="hero-credentials" aria-label="Recursos do sistema">
            <h3>O que está incluso</h3>
            <ul>
              <li>Horários disponíveis em tempo real</li>
              <li>Painel administrativo completo</li>
              <li>Funciona direto no celular</li>
              <li>Confirmação automática de agendamento</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <span className="eyebrow">Serviços</span>
          <h2>Escolha o cuidado certo para hoje</h2>
        </div>
        {loading && <StateMessage type="loading" title="Carregando serviços" />}
        {error && (
          <StateMessage type="error" title="Erro ao carregar dados" onRetry={onRetry}>
            {error}
          </StateMessage>
        )}
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
              <div className="service-card-footer">
                <strong>{formatCurrency(service.price)}</strong>
                <span>{service.duration} min</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="section dark">
        <div className="section-heading">
          <span className="eyebrow">Profissionais</span>
          <h2>Time Studio Cut</h2>
        </div>
        <div className="grid three">
          {professionals.map((professional) => (
            <article className="professional-card" key={professional.id}>
              <ProfessionalPhoto src={professional.photo} name={professional.name} />
              <div className="professional-card-body">
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
          <span className="eyebrow">Depoimentos</span>
          <h2>Clientes que já agilizaram a rotina</h2>
        </div>
        <div className="grid three">
          <div className="testimonial-card">
            <span className="testimonial-quote">"</span>
            <p>Marquei pelo celular e cheguei no horário certo. Muito prático.</p>
          </div>
          <div className="testimonial-card">
            <span className="testimonial-quote">"</span>
            <p>O painel deixa tudo organizado, sem conversa perdida no WhatsApp.</p>
          </div>
          <div className="testimonial-card">
            <span className="testimonial-quote">"</span>
            <p>O Studio Cut ficou mais rápido para atender e confirmar horários.</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div>
          <span className="footer-brand">AgendaFácil</span>
          <p className="footer-tagline">Sistema de agendamento online para negócios de serviço.</p>
        </div>
        <a
          href="https://github.com/RhanielRodri/agendafacil-sistema"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver no GitHub ↗
        </a>
      </footer>
    </main>
  );
}
