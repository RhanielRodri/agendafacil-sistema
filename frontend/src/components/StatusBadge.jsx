import React from "react";

const labels = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu"
};

export default function StatusBadge({ status }) {
  return <span className={`badge ${status.toLowerCase()}`}>{labels[status] || status}</span>;
}
