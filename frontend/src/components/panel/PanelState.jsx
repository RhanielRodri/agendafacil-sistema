import React from "react";
import { appointmentStatusLabels, followUpStatusLabels, leadStatusLabels } from "../../utils/panel.js";

export function StatusPill({ status, kind = "appointment" }) {
  const labels = kind === "lead"
    ? leadStatusLabels
    : kind === "followUp" ? followUpStatusLabels : appointmentStatusLabels;
  return <span className={`panel-status ${status.toLowerCase()}`}>{labels[status] || status}</span>;
}

export function PanelMessage({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className={`panel-message ${message.type}`} role={message.type === "error" ? "alert" : "status"}>
      <span>{message.text}</span>
      {onDismiss && (
        <button className="panel-btn-link" type="button" onClick={onDismiss}>Fechar</button>
      )}
    </div>
  );
}

export function PanelLoading({ rows = 3, label = "Carregando…" }) {
  return (
    <div className="panel-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => <i key={index} />)}
    </div>
  );
}

export function PanelEmpty({ title, children, actionLabel, onAction }) {
  return (
    <div className="panel-empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {actionLabel && onAction && (
        <button className="panel-btn" type="button" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}

// Conflito com agendamento existente é um estado próprio: não é erro de
// validação nem falha inesperada, e nada acontece sem decisão explícita.
export function PanelConflict({ title, conflicts = [], onConfirm, onCancel, confirmLabel = "Aplicar mesmo assim" }) {
  return (
    <div className="panel-conflict" role="alertdialog" aria-label={title}>
      <strong>{title}</strong>
      <p>
        Nenhum agendamento foi movido ou cancelado. Confira o impacto antes de decidir —
        os horários abaixo continuam marcados.
      </p>
      <ul>
        {conflicts.map((conflict) => (
          <li key={conflict.appointmentId}>
            <strong>{conflict.date.slice(8, 10)}/{conflict.date.slice(5, 7)} · {conflict.time}–{conflict.endTime}</strong>
            <span>{conflict.clientName} · {conflict.serviceName} · {conflict.professionalName}</span>
          </li>
        ))}
      </ul>
      <div className="panel-conflict-actions">
        <button className="panel-btn-danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
        <button className="panel-btn" type="button" onClick={onCancel}>Manter como está</button>
      </div>
    </div>
  );
}

export function PanelError({ title = "Não foi possível carregar", children, onRetry }) {
  return (
    <div className="panel-empty" role="alert">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {onRetry && (
        <button className="panel-btn" type="button" onClick={onRetry}>Tentar novamente</button>
      )}
    </div>
  );
}
