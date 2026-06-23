import React from "react";
import StatusBadge from "./StatusBadge.jsx";
import { formatDate } from "../utils/format.js";

export default function AppointmentCard({ appointment, onStatusChange }) {
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
        <p className="appointment-detail">{appointment.clientPhone}</p>
      </div>
      {onStatusChange && (
        <div className="status-select-wrapper">
          <select
            value={appointment.status}
            onChange={(event) => onStatusChange(appointment.id, event.target.value)}
          >
            <option value="NEW">Novo</option>
            <option value="CONFIRMED">Confirmado</option>
            <option value="COMPLETED">Concluído</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>
      )}
    </article>
  );
}
