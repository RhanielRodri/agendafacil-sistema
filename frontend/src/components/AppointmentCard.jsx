import React, { useState } from "react";
import StatusBadge from "./StatusBadge.jsx";
import { formatDate } from "../utils/format.js";
import { formatBrazilPhone } from "../utils/phone.js";

const transitions = {
  PENDING: [
    { status: "CONFIRMED", label: "Confirmar" },
    { status: "CANCELLED", label: "Cancelar" }
  ],
  CONFIRMED: [
    { status: "COMPLETED", label: "Concluir" },
    { status: "CANCELLED", label: "Cancelar" },
    { status: "NO_SHOW", label: "Não compareceu" }
  ]
};

const historyLabels = {
  CREATED: "Criado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  RESCHEDULED_FROM: "Reagendado para outro horário",
  RESCHEDULED_TO: "Criado por reagendamento",
  COMPLETED: "Concluído",
  NO_SHOW: "Não compareceu",
  STATUS_CHANGED: "Estado registrado"
};

export default function AppointmentCard({
  appointment,
  onStatusChange,
  onViewHistory,
  history,
  historyLoading
}) {
  const [reason, setReason] = useState("");
  const allowed = transitions[appointment.status] || [];

  return (
    <article className="appointment-card">
      <div>
        <div className="card-title-row">
          <h3>{appointment.clientName}</h3>
          <StatusBadge status={appointment.status} />
        </div>
        <p className="appointment-detail">
          {appointment.service.name} com {appointment.professional.name}
        </p>
        <p className="appointment-detail">{formatDate(appointment.date)} às {appointment.time}</p>
        <p className="appointment-detail">{formatBrazilPhone(appointment.clientPhone)}</p>
        {appointment.cancellationReason && (
          <p className="appointment-detail">Motivo: {appointment.cancellationReason}</p>
        )}
        {appointment.rescheduledFrom && (
          <p className="appointment-detail">Reagendado do agendamento #{appointment.rescheduledFrom.id}</p>
        )}
        {appointment.rescheduledTo && (
          <p className="appointment-detail">Substituído pelo agendamento #{appointment.rescheduledTo.id}</p>
        )}
      </div>

      {onStatusChange && allowed.length > 0 && (
        <div className="appointment-admin-actions">
          <label>
            Motivo opcional
            <input
              type="text"
              maxLength="300"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div>
            {allowed.map((action) => (
              <button
                key={action.status}
                type="button"
                onClick={() => onStatusChange(appointment.id, action.status, reason)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {onViewHistory && (
        <button className="history-toggle" type="button" onClick={() => onViewHistory(appointment.id)}>
          {historyLoading ? "Carregando histórico…" : history ? "Ocultar histórico" : "Ver histórico"}
        </button>
      )}

      {history && (
        <ol className="appointment-history">
          {history.map((event) => (
            <li key={event.id}>
              <strong>{historyLabels[event.type] || event.type}</strong>
              <span>{new Date(event.createdAt).toLocaleString("pt-BR")}</span>
              {event.metadata?.reason && <span>Motivo: {event.metadata.reason}</span>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
