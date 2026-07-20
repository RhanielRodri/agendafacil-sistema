import React, { useState } from "react";
import BookingFlow from "./BookingFlow.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { formatCurrency } from "../utils/format.js";
import tenant from "../config/tenant.js";

function ProfessionalPhoto({ src, name }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  if (failed || !src) {
    return <div className="professional-avatar" aria-hidden="true">{initials}</div>;
  }

  return <img src={src} alt={name} onError={() => setFailed(true)} />;
}

function Hero({ onStartBooking }) {
  function scrollToServices() {
    document.getElementById("servicos")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section className="hero">
      <div className="hero-content">
        <div className="hero-tag">
          <div className="hero-tag-line" />
          <span>{tenant.hero.eyebrow}</span>
        </div>
        <h1>
          {tenant.hero.headline.map((line, index) => (
            <React.Fragment key={line}>
              {index === 1 ? <span className="dim">{line}</span> : line}
              {index < tenant.hero.headline.length - 1 && <br />}
            </React.Fragment>
          ))}
        </h1>
        <p className="hero-sub">{tenant.hero.sub}</p>
        <div className="hero-btns">
          <button className="primary-button" type="button" onClick={onStartBooking}>
            {tenant.hero.primaryCta}
          </button>
          <button className="secondary-button" type="button" onClick={scrollToServices}>
            {tenant.hero.secondaryCta}
          </button>
        </div>
        <div className="hero-facts" aria-label="Informações de atendimento">
          {tenant.hero.highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}
        </div>
      </div>
      <div className="hero-image">
        <img src={tenant.hero.image} alt={tenant.hero.imageAlt} />
        <div className="hero-image-badge">
          <div className="hero-badge-dot" />
          <span>{tenant.hero.badge}</span>
        </div>
      </div>
    </section>
  );
}

function ServicesSection({ services, loading, error, selectedServiceId, onSelect, onRetry }) {
  return (
    <section className="section services-section" id="servicos">
      <div className="section-heading">
        <span className="eyebrow">{tenant.copy.servicesEyebrow}</span>
        <h2>{tenant.copy.servicesTitle}</h2>
      </div>
      {loading && <StateMessage type="loading" title="Carregando opções…" />}
      {error && (
        <StateMessage type="error" title="Agendamento temporariamente indisponível" onRetry={onRetry}>
          Não foi possível consultar as opções agora. Tente novamente em instantes.
        </StateMessage>
      )}
      {!loading && !error && services.length === 0 && (
        <StateMessage title="Opções temporariamente indisponíveis">
          Tente novamente em instantes.
        </StateMessage>
      )}
      {!loading && !error && services.length > 0 && (
        <div className="grid services-grid">
          {services.map((service, index) => (
            <button
              className={selectedServiceId === String(service.id) ? "service-card selected" : "service-card"}
              key={service.id}
              type="button"
              onClick={() => onSelect(service.id)}
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
      )}
    </section>
  );
}

function ProfessionalsSection({ professionals, loading, error, onRetry }) {
  return (
    <section className="section professionals-section">
      <div className="section-heading">
        <span className="eyebrow">{tenant.copy.professionalsEyebrow}</span>
        <h2>{tenant.copy.professionalsTitle}</h2>
      </div>
      {loading && <StateMessage type="loading" title="Carregando equipe…" />}
      {error && (
        <StateMessage type="error" title="Equipe temporariamente indisponível" onRetry={onRetry}>
          Não foi possível consultar a equipe agora. Tente novamente em instantes.
        </StateMessage>
      )}
      {!loading && !error && professionals.length === 0 && (
        <StateMessage title="Equipe temporariamente indisponível">
          Tente novamente em instantes.
        </StateMessage>
      )}
      {!loading && !error && professionals.length > 0 && (
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
      )}
    </section>
  );
}

function DetailsSection() {
  return (
    <section className="section details-section">
      <div className="section-heading">
        <span className="eyebrow">{tenant.details.eyebrow}</span>
        <h2>{tenant.details.title}</h2>
      </div>
      <div className="detail-grid">
        {tenant.details.items.map((item) => (
          <article className="detail-card" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <section className="section process-section">
      <div className="section-heading">
        <span className="eyebrow">{tenant.process.eyebrow}</span>
        <h2>{tenant.process.title}</h2>
      </div>
      <div className="process-grid">
        {tenant.process.items.map((item) => (
          <article className="process-card" key={item.number}>
            <span>{item.number}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SpaceSection() {
  return (
    <section className="section studio-section">
      <div className="section-heading">
        <span className="eyebrow">{tenant.space.eyebrow}</span>
        <h2>{tenant.space.title}</h2>
        {tenant.space.description.map((paragraph) => (
          <p className="section-description" key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="studio-photo">
        <img src={tenant.space.image} alt={tenant.space.imageAlt} />
        <div className="studio-caption">
          <strong>{tenant.name}</strong>
          <span>{tenant.city} · {tenant.schedule}</span>
        </div>
      </div>
    </section>
  );
}

function BookingSection({ services, professionals, selectedServiceId, loading, error, onSuccess, onRetry }) {
  if (loading) {
    return (
      <section className="section booking booking-state" id="agendamento">
        <StateMessage type="loading" title="Carregando agendamento…" />
      </section>
    );
  }

  if (error || services.length === 0 || professionals.length === 0) {
    return (
      <section className="section booking booking-state" id="agendamento">
        <div className="section-heading">
          <span className="eyebrow">Agendamento</span>
          <h2>Serviço temporariamente indisponível</h2>
        </div>
        <StateMessage type="error" title="Não foi possível abrir a agenda" onRetry={onRetry}>
          Tente novamente em instantes.
        </StateMessage>
      </section>
    );
  }

  return (
    <BookingFlow
      services={services}
      professionals={professionals}
      initialServiceId={selectedServiceId}
      onSuccess={onSuccess}
    />
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div>
        <span className="footer-brand">{tenant.name}</span>
        <p className="footer-tagline">{tenant.city} · {tenant.footer.tagline}</p>
      </div>
      <span className="footer-credit">Desenvolvido pela SOR ONE</span>
    </footer>
  );
}

export default function Home({ services, professionals, loading, error, onSuccess, onRetry }) {
  const [selectedServiceId, setSelectedServiceId] = useState("");

  function scrollToBooking() {
    document.getElementById("agendamento")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleServiceSelect(serviceId) {
    setSelectedServiceId(String(serviceId));
    scrollToBooking();
  }

  const sharedSections = {
    hero: <Hero key="hero" onStartBooking={scrollToBooking} />,
    services: (
      <ServicesSection
        key="services"
        services={services}
        loading={loading}
        error={error}
        selectedServiceId={selectedServiceId}
        onSelect={handleServiceSelect}
        onRetry={onRetry}
      />
    ),
    professionals: (
      <ProfessionalsSection
        key="professionals"
        professionals={professionals}
        loading={loading}
        error={error}
        onRetry={onRetry}
      />
    ),
    details: <DetailsSection key="details" />,
    process: <ProcessSection key="process" />,
    space: <SpaceSection key="space" />,
    booking: (
      <BookingSection
        key="booking"
        services={services}
        professionals={professionals}
        selectedServiceId={selectedServiceId}
        loading={loading}
        error={error}
        onSuccess={onSuccess}
        onRetry={onRetry}
      />
    )
  };

  const order = tenant.slug === "lumiere"
    ? ["hero", "details", "space", "services", "process", "professionals", "booking"]
    : ["hero", "services", "professionals", "details", "booking", "process", "space"];

  return (
    <main className={`business-site ${tenant.slug}-site`}>
      {order.map((section) => sharedSections[section])}
      <Footer />
    </main>
  );
}
