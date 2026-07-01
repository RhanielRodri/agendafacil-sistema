import React from "react";
import { demos } from "../config/tenant.js";

const fichas = [
  { position: 3, time: "14:00", title: "Corte + Barba", stamp: "Confirmado", variant: "green" },
  { position: 2, time: "10:30", title: "Coloração", stamp: "Confirmado", variant: "green" },
  { position: 1, time: "09:00", title: "Primeiro atendimento", stamp: "Confirmado", variant: "default" }
];

const problemRows = [
  {
    label: "Espera",
    text: "O cliente manda mensagem e fica esperando alguém ver e responder — em vez de já sair com horário marcado."
  },
  {
    label: "Conflito",
    text: "Dois clientes podem cair no mesmo horário quando a agenda vive espalhada entre conversas."
  },
  {
    label: "Repetição",
    text: "Cada atendimento exige confirmar manualmente, todos os dias — o mesmo trabalho, de novo e de novo."
  }
];

const panelPoints = [
  {
    title: "Visão do dia em um olhar",
    text: "Quantos atendimentos hoje, quantos confirmados, quantos chegaram agora."
  },
  {
    title: "Lista de próximos atendimentos",
    text: "Nome, serviço, horário e telefone do cliente, em ordem — sem precisar rolar conversa antiga."
  },
  {
    title: "Serviços e preços sempre visíveis",
    text: "O que você oferece e quanto cobra, num só lugar — fácil de atualizar quando mudar."
  }
];

const panelStats = [
  { label: "Hoje", value: "4" },
  { label: "Confirmados", value: "3", variant: "accent" },
  { label: "Novos", value: "1", variant: "warn" },
  { label: "Próx. 7 dias", value: "12" }
];

const panelItems = [
  { time: "09:30", name: "Corte masculino — Bruno Alves", tag: "Confirmado" },
  { time: "10:30", name: "Barba completa — Bruno Alves", tag: "Confirmado" },
  { time: "14:00", name: "Corte + barba — Bruno Alves", tag: "Novo", isNew: true }
];

const flowSteps = [
  {
    num: "01 · Cliente",
    title: "Página de agendamento",
    text: "Acessa o link, vê os serviços e escolhe sem precisar perguntar nada."
  },
  {
    num: "02 · Cliente",
    title: "Escolhe horário disponível",
    text: "Vê só os horários reais da agenda — sem risco de conflito."
  },
  {
    num: "03 · Sistema",
    title: "Confirmação automática",
    text: "O agendamento entra direto no painel, já confirmado."
  }
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
          <span className="platform-logo-mark">AF</span>
          AgendaFácil
        </a>
        <nav className="platform-nav" aria-label="Navegação principal">
          <a href="#problema">O problema</a>
          <a href="#solucao">Como funciona</a>
          <a href="#demonstracoes">Demonstrações</a>
        </nav>
        <a className="platform-btn-primary" href="#demonstracoes">Ver demonstrações</a>
      </header>

      <section className="platform-hero">
        <div>
          <span className="platform-eyebrow">Agenda organizada, atendimento profissional</span>
          <h1>Sua agenda<br />sai do WhatsApp<br />e vira sistema.</h1>
          <p className="platform-hero-lead">
            Página de agendamento, escolha de horário e painel administrativo — pra você parar de
            confirmar atendimento um por um na mensagem.
          </p>
          <div className="platform-hero-actions">
            <a className="platform-btn-primary" href="#demonstracoes">Ver demonstrações</a>
            <a className="platform-btn-ghost" href="#solucao">Como funciona</a>
          </div>
        </div>
        <div className="platform-ficha-stack">
          {fichas.map((ficha) => (
            <div className={`platform-ficha platform-ficha-${ficha.position}`} key={ficha.time}>
              <div className="platform-ficha-time">{ficha.time}</div>
              <div className="platform-ficha-title">{ficha.title}</div>
              <span className={`platform-ficha-stamp ${ficha.variant === "green" ? "green" : ""}`}>
                {ficha.stamp}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="platform-section" id="problema">
        <div className="platform-section-heading">
          <span className="platform-eyebrow">O problema</span>
          <h2>Cada horário marcado pelo WhatsApp é uma decisão manual a mais no seu dia.</h2>
          <p>Sem agenda visível, o cliente espera resposta e você perde tempo confirmando o que já devia estar organizado.</p>
        </div>
        <div className="platform-problem-list">
          {problemRows.map((row) => (
            <div className="platform-problem-row" key={row.label}>
              <div className="platform-problem-time">{row.label}</div>
              <p>{row.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="platform-panel-section">
        <div className="platform-section platform-panel-grid">
          <div>
            <span className="platform-eyebrow">O painel</span>
            <h2>Sua agenda, vista de fora do WhatsApp.</h2>
            <p>Tudo que entra pela página de agendamento cai direto aqui — sem você ter que abrir conversa nenhuma pra saber o que tem no dia.</p>
            <div className="platform-panel-points">
              {panelPoints.map((point, index) => (
                <div className="platform-panel-point" key={point.title}>
                  <div className="platform-panel-point-mark">{index + 1}</div>
                  <div>
                    <h4>{point.title}</h4>
                    <p>{point.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="platform-panel-mock">
            <div className="platform-panel-mock-head">
              <div className="biz">Studio Cut</div>
              <div className="sub">Painel administrativo</div>
            </div>
            <div className="platform-panel-stats">
              {panelStats.map((stat) => (
                <div className="platform-panel-stat" key={stat.label}>
                  <div className="label">{stat.label}</div>
                  <div className={`value ${stat.variant || ""}`}>{stat.value}</div>
                </div>
              ))}
            </div>
            <div className="platform-panel-list">
              {panelItems.map((item) => (
                <div className="platform-panel-item" key={item.time}>
                  <div className="info">
                    <div className="time">{item.time}</div>
                    <div className="name">{item.name}</div>
                  </div>
                  <div className={`tag ${item.isNew ? "new" : ""}`}>{item.tag}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="platform-section platform-solution" id="solucao">
        <div className="platform-section-heading">
          <span className="platform-eyebrow">A solução</span>
          <h2>O mesmo fluxo de atendimento, sem você no meio de cada etapa.</h2>
          <p>O cliente escolhe, confirma e recebe — você só acompanha pelo painel.</p>
        </div>
        <div className="platform-flow">
          {flowSteps.map((step) => (
            <div className="platform-flow-step" key={step.title}>
              <div className="platform-flow-num">{step.num}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="platform-section platform-showcases" id="demonstracoes">
        <div className="platform-section-heading center">
          <span className="platform-eyebrow">Demonstrações</span>
          <h2>Veja o sistema com a cara do seu negócio.</h2>
          <p>Mesma estrutura, identidade adaptada — barbearia, salão, clínica ou estúdio.</p>
        </div>
        <div className="platform-showcase-grid">
          {Object.values(demos).map((demo) => (
            <a className="platform-showcase-card" href={`/demo/${demo.slug}`} key={demo.slug}>
              <span className="platform-showcase-stamp">{demo.segment}</span>
              <h3>{demo.name}</h3>
              <p>{showcaseCopy[demo.slug]}</p>
              <span className="platform-showcase-link">Ver demo →</span>
            </a>
          ))}
        </div>
      </section>

      <footer className="platform-footer">
        <div>AgendaFácil — by SOR OS</div>
        <div>Vila Velha, ES</div>
      </footer>
    </main>
  );
}
