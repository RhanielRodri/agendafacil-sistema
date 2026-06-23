import React from "react";
import { formatDate } from "../utils/format.js";

export default function Success({ appointment, onBack }) {
  return (
    <main className="success-page">
      <section className="success-panel">
        <div className="success-icon" aria-hidden="true">✓</div>
        <span className="eyebrow">Agendamento confirmado</span>
        <h1>Horário solicitado com sucesso!</h1>
        <p>
          O Studio Cut recebeu seu agendamento e poderá confirmar o status pelo painel.
        </p>
        <div className="summary-box">
          <strong>{appointment.service.name}</strong>
          <span>{appointment.professional.name}</span>
          <span>{formatDate(appointment.date)} às {appointment.time}</span>
          <span>{appointment.clientName}</span>
        </div>
        <button className="primary-button" onClick={onBack}>
          Voltar para a home
        </button>
      </section>
    </main>
  );
}
