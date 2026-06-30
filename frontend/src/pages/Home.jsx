import React, { useState } from "react";
import BookingFlow from "./BookingFlow.jsx";
import { formatCurrency } from "../utils/format.js";
import StateMessage from "../components/StateMessage.jsx";
import { useTranslation } from "../i18n/I18nContext.jsx";
import tenant from "../config/tenant.js";

function ProfessionalPhoto({ src, name }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  if (failed || !src) {
    return <div className="professional-avatar" aria-hidden="true">{initials}</div>;
  }

  return <img src={src} alt={name} onError={() => setFailed(true)} />;
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
        <div className="hero-content">
          <div className="hero-tag">
            <div className="hero-tag-line"></div>
            <span>{tenant.hero.eyebrow}</span>
          </div>
          <h1>
            {tenant.hero.headline.map((line, i) => (
              <React.Fragment key={i}>
                {i === 1 ? <span className="dim">{line}</span> : line}
                {i < tenant.hero.headline.length - 1 && <br />}
              </React.Fragment>
            ))}
          </h1>
          <p className="hero-sub">{tenant.hero.sub}</p>
          <div className="hero-btns">
            <button className="primary-button" type="button" onClick={handleStartBooking}>
              {t.hero_cta}
            </button>
            <button className="secondary-button" type="button" onClick={handleStartBooking}>
              {tenant.copy.secondaryCta}
            </button>
          </div>
          <div className="hero-stats">
            {tenant.hero.stats.map((stat, i) => (
              <div key={i}>
                <div className="hero-stat-num">{stat.value}</div>
                <div className="hero-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-image">
          <img
            src={tenant.hero.image}
            alt={tenant.hero.imageAlt}
          />
          <div className="hero-image-badge">
            <div className="hero-badge-dot"></div>
            <span>Agendamento online disponível</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <span className="eyebrow">{tenant.copy.servicesEyebrow}</span>
          <h2>{tenant.copy.servicesTitle}</h2>
        </div>
        {loading && <StateMessage type="loading" title={t.services_loading} />}
        {error && (
          <StateMessage type="error" title={t.services_error} onRetry={onRetry}>
            {error}
          </StateMessage>
        )}
        {!loading && !error && services.length === 0 && <StateMessage title={t.services_empty} />}
        <div className="grid three">
          {services.map((service, index) => (
            <button
              className={selectedServiceFromHome === String(service.id) ? "service-card selected" : "service-card"}
              key={service.id}
              type="button"
              onClick={() => handleServiceSelect(service.id)}
            >
              <div className="service-card-num">{String(index + 1).padStart(2, "0")}</div>
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
          <span className="eyebrow">{tenant.copy.professionalsEyebrow}</span>
          <h2>{tenant.copy.professionalsTitle}</h2>
        </div>
        <div className="grid team-grid">
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

      <section className="section studio-section">
        <div className="section-heading">
          <span className="eyebrow">{tenant.space.eyebrow}</span>
          <h2>{tenant.space.title}</h2>
          {tenant.space.description?.map((paragraph) => (
            <p className="section-description" key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="studio-photo">
          <img
            src={tenant.space.image}
            alt={tenant.space.imageAlt}
          />
          <div className="studio-caption">
            <strong>{tenant.name}</strong>
            <span>{tenant.city} · {tenant.schedule}</span>
          </div>
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
          <span className="eyebrow">{tenant.copy.testimonialsEyebrow}</span>
          <h2>{tenant.copy.testimonialsTitle}</h2>
        </div>
        <div className="grid three">
          {tenant.testimonials.map((text, i) => (
            <div className="testimonial-card" key={i}>
              <span className="testimonial-quote">"</span>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div>
          <span className="footer-brand">{tenant.name}</span>
          <p className="footer-tagline">{tenant.city} · {tenant.footer.tagline}</p>
        </div>
        <div className="footer-links">
          {tenant.contact.whatsapp && (
            <a href={`https://wa.me/${tenant.contact.whatsapp}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          )}
          <a className="footer-credit" href="/">Desenvolvido com AgendaFácil</a>
        </div>
      </footer>
    </main>
  );
}
