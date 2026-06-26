import React, { useState } from "react";
import BookingFlow from "./BookingFlow.jsx";
import { formatCurrency } from "../utils/format.js";
import StateMessage from "../components/StateMessage.jsx";
import { useTranslation } from "../i18n/I18nContext.jsx";

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
  const { t } = useTranslation();
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
            <span className="eyebrow">{t.hero_eyebrow}</span>
            <h1>{t.hero_title}</h1>
            <p className="hero-sub">{t.hero_sub}</p>
            <button className="primary-button" type="button" onClick={handleStartBooking}>
              {t.hero_cta}
            </button>
            <p className="hero-perks">{t.hero_perks}</p>
          </div>

          <aside className="hero-credentials" aria-label="Recursos do sistema">
            <h3>{t.hero_includes}</h3>
            <ul>
              <li>{t.perk_1}</li>
              <li>{t.perk_2}</li>
              <li>{t.perk_3}</li>
              <li>{t.perk_4}</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <span className="eyebrow">{t.services_eyebrow}</span>
          <h2>{t.services_title}</h2>
        </div>
        {loading && <StateMessage type="loading" title={t.services_loading} />}
        {error && (
          <StateMessage type="error" title={t.services_error} onRetry={onRetry}>
            {error}
          </StateMessage>
        )}
        {!loading && !error && services.length === 0 && <StateMessage title={t.services_empty} />}
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
          <span className="eyebrow">{t.professionals_eyebrow}</span>
          <h2>{t.professionals_title}</h2>
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
          <span className="eyebrow">{t.testimonials_eyebrow}</span>
          <h2>{t.testimonials_title}</h2>
        </div>
        <div className="grid three">
          <div className="testimonial-card">
            <span className="testimonial-quote">"</span>
            <p>{t.testimonial_1}</p>
          </div>
          <div className="testimonial-card">
            <span className="testimonial-quote">"</span>
            <p>{t.testimonial_2}</p>
          </div>
          <div className="testimonial-card">
            <span className="testimonial-quote">"</span>
            <p>{t.testimonial_3}</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div>
          <span className="footer-brand" style={{ fontFamily: "var(--font-display)", fontWeight: 400, letterSpacing: "0.03em" }}>Lumiere</span>
          <p className="footer-tagline">{t.footer_tagline}</p>
        </div>
        <a
          href="https://github.com/RhanielRodri/agendafacil-sistema"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.footer_github}
        </a>
      </footer>
    </main>
  );
}
