import React from "react";
import { demos } from "../config/tenant.js";

export default function PlatformLanding() {
  return (
    <main className="platform-page">
      <header className="platform-header">
        <a className="platform-logo" href="/" aria-label="AgendaFácil">
          <span>AF</span>
          AgendaFácil
        </a>
        <a className="platform-contact" href="#experiencias">Ver experiências</a>
      </header>

      <section className="platform-hero">
        <span className="platform-eyebrow">Agendamento online para negócios de serviço</span>
        <h1>Menos mensagens.<br />Mais horários confirmados.</h1>
        <p>Seus clientes escolhem o serviço, profissional e horário. Você acompanha tudo em um painel simples.</p>
        <a className="platform-primary-link" href="#experiencias">Ver experiências</a>
      </section>

      <section className="platform-features" aria-label="Recursos do AgendaFácil">
        <article><strong>Agenda online</strong><span>Disponibilidade em tempo real</span></article>
        <article><strong>Painel organizado</strong><span>Agendamentos em um só lugar</span></article>
        <article><strong>Experiência personalizada</strong><span>Identidade visual de cada negócio</span></article>
      </section>

      <section className="platform-showcases" id="experiencias">
        <div className="platform-section-heading">
          <span className="platform-eyebrow">Experiências em funcionamento</span>
          <h2>Veja o AgendaFácil aplicado a negócios diferentes.</h2>
        </div>
        <div className="platform-showcase-grid">
          {Object.values(demos).map((demo) => (
            <article className="platform-showcase-card" key={demo.slug}>
              <img src={demo.hero.image} alt={demo.hero.imageAlt} />
              <div>
                <span>{demo.segment}</span>
                <h3>{demo.name}</h3>
                <p>{demo.metadata.description}</p>
                <a href={`/demo/${demo.slug}`}>Conhecer {demo.name}</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="platform-footer">
        <strong>AgendaFácil</strong>
        <span>Agendamento simples para negócios que vivem de horário.</span>
      </footer>
    </main>
  );
}
