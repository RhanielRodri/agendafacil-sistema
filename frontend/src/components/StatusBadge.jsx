import React from "react";

const labels = {
  NEW: "Novo",
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado"
};

export default function StatusBadge({ status }) {
  return <span className={`badge ${status.toLowerCase()}`}>{labels[status] || status}</span>;
}
