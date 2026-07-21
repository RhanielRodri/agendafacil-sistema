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
