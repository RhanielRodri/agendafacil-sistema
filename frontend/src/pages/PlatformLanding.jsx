import React from "react";
import { demos } from "../config/tenant.js";

const painPoints = [
  "O cliente chama no WhatsApp e demora para receber resposta.",
  "Horários se perdem entre mensagens e conversas.",
  "A agenda manual vira bagunça nos dias mais cheios.",
  "O negócio transmite uma imagem menos profissional.",
  "O dono perde tempo confirmando cada atendimento."
];

const solutionItems = [
  "Página pública de agendamento",
  "Escolha de serviço e profissional",
  "Seleção de data e horário disponível",
  "Confirmação de agendamento",
  "Painel administrativo",
  "Status dos atendimentos"
];

const benefits = [
  ["Menos mensagens", "O cliente encontra as informações e agenda sem depender de resposta manual."],
  ["Mais organização", "Serviços, profissionais e horários ficam reunidos em um fluxo único."],
  ["Imagem profissional", "Uma experiência digital com a identidade visual do seu negócio."],
  ["Atendimento rápido", "O cliente escolhe e confirma o melhor horário em poucos passos."],
  ["Fácil adaptação", "O mesmo sistema pode atender diferentes negócios com agenda."]
];

const audiences = [
  "Barbearias",
  "Salões",
  "Clínicas",
  "Estética",
  "Personal trainers",
  "Pet shops",
  "Prestadores de serviço"
];

const showcaseCopy = {
  "studio-cut": "Agendamento para barbearias e salões, com serviços, equipe e horários disponíveis.",
  lumiere: "Experiência para clínicas de estética, com tratamentos, profissionais e agenda online."
};

export default function PlatformLanding() {
  return (
    <main className="platform-page">
      <header className="platform-header">
        <a className="platform-logo" href="/" aria-label="AgendaFácil">
          <span>AF</span>
          AgendaFácil
        </a>
        <nav className="platform-nav" aria-label="Navegação principal">
          <a href="#solucao">Solução</a>
          <a href="#demonstracoes">Demonstrações</a>
        </nav>
        <a className="platform-header-cta" href="#demonstracoes">Ver demonstrações</a>
      </header>

      <section className="platform-hero">
        <div className="platform-hero-copy">
          <span className="platform-eyebrow">Agenda organizada. Atendimento profissional.</span>
          <h1>AgendaFácil</h1>
          <h2>Sistema de agendamento online para pequenos negócios</h2>
          <p>Transforme mensagens perdidas no WhatsApp em agendamentos organizados, com página de serviços, horários disponíveis e painel administrativo.</p>
          <div className="platform-hero-actions">
            <a className="platform-primary-link" href="#demonstracoes">Ver demonstrações</a>
            <a className="platform-secondary-link" href="#solucao">Conhecer solução</a>
          </div>
        </div>

        <div className="platform-product-preview" aria-label="Exemplo do painel AgendaFácil">
          <div className="platform-preview-header">
            <div>
              <span>Painel administrativo</span>
              <strong>Agenda de hoje</strong>
            </div>
            <span className="platform-live-badge">Online</span>
          </div>
          <div className="platform-preview-metrics">
            <div><strong>8</strong><span>Agendamentos</span></div>
            <div><strong>5</strong><span>Confirmados</span></div>
            <div><strong>3</strong><span>Novos</span></div>
          </div>
          <div className="platform-preview-list">
            <div><time>09:00</time><span><strong>Primeiro atendimento</strong><small>Confirmado</small></span></div>
            <div><time>10:30</time><span><strong>Segundo atendimento</strong><small>Novo</small></span></div>
            <div><time>14:00</time><span><strong>Terceiro atendimento</strong><small>Confirmado</small></span></div>
          </div>
        </div>
      </section>

      <section className="platform-problem platform-section">
        <div className="platform-section-heading">
          <span className="platform-eyebrow">O problema</span>
          <h2>Organizar horários pelo WhatsApp custa tempo e vendas.</h2>
          <p>Quando todo agendamento depende de conversa manual, o atendimento fica lento e a rotina perde previsibilidade.</p>
        </div>
        <div className="platform-problem-grid">
          {painPoints.map((pain, index) => (
            <article key={pain}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{pain}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="platform-solution platform-section" id="solucao">
        <div className="platform-section-heading">
          <span className="platform-eyebrow">A solução</span>
          <h2>Do primeiro clique ao horário confirmado.</h2>
          <p>O AgendaFácil cria uma experiência direta para o cliente e uma rotina mais organizada para o negócio.</p>
        </div>
        <div className="platform-solution-grid">
          {solutionItems.map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="platform-showcases platform-section" id="demonstracoes">
        <div className="platform-section-heading">
          <span className="platform-eyebrow">Demonstrações</span>
          <h2>O mesmo sistema, adaptado à identidade de cada negócio.</h2>
        </div>
        <div className="platform-showcase-grid">
          {Object.values(demos).map((demo) => (
            <article className={`platform-showcase-card ${demo.slug}`} key={demo.slug}>
              <div className="platform-showcase-media">
                <img src={demo.hero.image} alt={demo.hero.imageAlt} />
                <span className="platform-showcase-logo">{demo.logo.mark}</span>
              </div>
              <div className="platform-showcase-content">
                <span>{demo.segment}</span>
                <h3>{demo.name}</h3>
                <p>{showcaseCopy[demo.slug]}</p>
                <a href={`/demo/${demo.slug}`}>Ver demo</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="platform-benefits platform-section">
        <div className="platform-section-heading">
          <span className="platform-eyebrow">Benefícios</span>
          <h2>Uma operação mais simples para você e seus clientes.</h2>
        </div>
        <div className="platform-benefits-grid">
          {benefits.map(([title, text]) => (
            <article key={title}>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="platform-audience platform-section">
        <div className="platform-section-heading">
          <span className="platform-eyebrow">Para quem é</span>
          <h2>Para negócios que vivem de agenda.</h2>
        </div>
        <div className="platform-audience-list">
          {audiences.map((audience) => <span key={audience}>{audience}</span>)}
        </div>
      </section>

      <section className="platform-final-cta platform-section">
        <div>
          <span className="platform-eyebrow">AgendaFácil para o seu negócio</span>
          <h2>Quer um sistema de agendamento com a identidade do seu negócio?</h2>
        </div>
        <div className="platform-final-action">
          <button type="button" disabled>Solicitar versão personalizada</button>
          <small>Canal comercial em configuração.</small>
        </div>
      </section>

      <footer className="platform-footer">
        <strong>AgendaFácil</strong>
        <span>Agendamento online para pequenos negócios.</span>
      </footer>
    </main>
  );
}
