import React, { useState } from "react";
import { api } from "../../services/api.js";
import { usePanelData } from "../../utils/usePanelData.js";
import { PanelEmpty, PanelError, PanelLoading, PanelMessage, StatusPill } from "../../components/panel/PanelState.jsx";
import {
  appointmentTransitions,
  leadSourceLabels,
  leadStatusLabels,
  leadStatuses,
  relativeDayLabel
} from "../../utils/panel.js";

// Os atalhos no fim levam de volta para as filas que a vertical prioriza.
// Nenhum valor é calculado aqui: tudo o que aparece vem do Worker.
export default function Overview({ vertical, onNavigate, onSessionExpired, canAccess }) {
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const { state, data, error, reload } = usePanelData(() => api.getOverview(), [], onSessionExpired);

  async function applyAction(appointment, status) {
    setBusyId(appointment.id);
    setMessage(null);
    try {
      await api.updateAppointmentStatus(appointment.id, status);
      setMessage({ type: "success", text: `${appointment.clientName}: atendimento atualizado.` });
      await reload();
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    } finally {
      setBusyId(null);
    }
  }

  if (state === "loading" && !data) return <PanelLoading rows={5} label="Carregando visão geral…" />;
  if (state === "error") return <PanelError onRetry={reload}>{error}</PanelError>;
  if (!data) return null;

  const waiting = vertical.waitingSource ? data.attention.activeLeadsBySource[vertical.waitingSource] : null;

  const attentionItems = {
    waiting: waiting === null ? null : {
      value: waiting,
      label: vertical.waitingLabel,
      target: { module: "leads", params: vertical.waitingSource ? { source: vertical.waitingSource } : {} }
    },
    overdueFollowUps: {
      value: data.attention.overdueFollowUps,
      label: "Follow-ups vencidos",
      target: { module: "follow-ups", params: { bucket: "overdue" } }
    },
    followUpsToday: {
      value: data.attention.followUpsToday,
      label: "Follow-ups ainda hoje",
      target: { module: "follow-ups", params: { bucket: "today" } }
    },
    leadsWithoutNextAction: {
      value: data.attention.leadsWithoutNextAction,
      label: "Leads sem próxima ação",
      target: { module: "leads", params: { noNextAction: true } }
    },
    leadsWithoutOwner: {
      value: data.attention.leadsWithoutOwner,
      label: "Leads sem responsável",
      target: { module: "leads", params: { unassigned: true } }
    },
    pendingUpcoming: {
      value: data.attention.pendingUpcoming,
      label: "Agendamentos pendentes nos próximos 7 dias",
      target: { module: "agenda", params: { status: "PENDING" } }
    }
  };

  const stats = [
    { key: "total", label: "Hoje", value: data.day.total, tone: "" },
    { key: "CONFIRMED", label: "Confirmados", value: data.day.byStatus.CONFIRMED, tone: "confirmed" },
    { key: "PENDING", label: "Pendentes", value: data.day.byStatus.PENDING, tone: "pending" },
    { key: "COMPLETED", label: "Concluídos", value: data.day.byStatus.COMPLETED, tone: "" },
    { key: "CANCELLED", label: "Cancelados", value: data.day.byStatus.CANCELLED, tone: "cancelled" },
    { key: "NO_SHOW", label: "Não compareceram", value: data.day.byStatus.NO_SHOW, tone: "noshow" }
  ];

  return (
    <>
      <PanelMessage message={message} onDismiss={() => setMessage(null)} />

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>{vertical.dayTitle}</h2>
          <p>{relativeDayLabel(data.date)} · {data.date.split("-").reverse().join("/")}</p>
        </div>
        <div className="panel-stats">
          {stats.map((stat) => (
            <button
              key={stat.key}
              className="panel-stat"
              type="button"
              disabled={!canAccess?.("agenda")}
              onClick={() => onNavigate("agenda", stat.key === "total" ? {} : { status: stat.key })}
            >
              <span className="panel-stat-label">{stat.label}</span>
              <span className={`panel-stat-value ${stat.value ? stat.tone : "is-zero"}`}>{stat.value}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Atenção necessária</h2>
          <p>{vertical.waitingHint}</p>
        </div>
        <div className="panel-attention">
          {vertical.attentionOrder
            .map((key) => [key, attentionItems[key]])
            .filter(([, item]) => item && canAccess?.(item.target.module))
            .map(([key, item]) => (
              <button
                key={key}
                className={`panel-attention-item ${item.value ? "is-alert" : "is-clear"}`}
                type="button"
                onClick={() => onNavigate(item.target.module, item.target.params)}
              >
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </button>
            ))}
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Próximos atendimentos</h2>
          {canAccess?.("agenda") && (
            <button className="panel-btn-link" type="button" onClick={() => onNavigate("agenda", {})}>
              Ver agenda completa
            </button>
          )}
        </div>
        {data.upcoming.length === 0 ? (
          <PanelEmpty title="Nada em aberto para hoje">
            Agendamentos pendentes e confirmados do dia aparecem aqui.
          </PanelEmpty>
        ) : (
          <div className="panel-list">
            {data.upcoming.map((appointment) => {
              const actions = appointmentTransitions[appointment.status] || [];
              const primary = actions.find((action) => action.primary);
              return (
                <div className="panel-row" key={appointment.id}>
                  <div className="panel-row-time">
                    {appointment.time}
                    <small>{appointment.durationMinutes} min</small>
                  </div>
                  <div className="panel-row-main">
                    <strong>{appointment.clientName}</strong>
                    <span>{appointment.clientPhone}</span>
                  </div>
                  <div className="panel-row-cell">
                    <strong>{appointment.serviceName}</strong>
                    {appointment.leadSource && (
                      <span>Origem: {leadSourceLabels[appointment.leadSource]}</span>
                    )}
                  </div>
                  <div className="panel-row-cell">
                    <strong>{appointment.professionalName}</strong>
                  </div>
                  <div className="panel-row-status">
                    <StatusPill status={appointment.status} />
                  </div>
                  <div className="panel-row-actions">
                    {primary && canAccess?.("agenda") && (
                      <button
                        className="panel-btn-primary"
                        type="button"
                        disabled={busyId === appointment.id}
                        onClick={() => applyAction(appointment, primary.status)}
                      >
                        {primary.label}
                      </button>
                    )}
                    {canAccess?.("agenda") && (
                      <button
                        className="panel-btn"
                        type="button"
                        onClick={() => onNavigate("agenda", { date: appointment.date, focus: appointment.id })}
                      >
                        Abrir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Relacionamento</h2>
          {canAccess?.("leads") && (
            <button className="panel-btn-link" type="button" onClick={() => onNavigate("leads", {})}>
              Abrir leads
            </button>
          )}
        </div>
        <div className="panel-stats">
          {leadStatuses.map((status) => (
            <button
              key={status}
              className="panel-stat"
              type="button"
              disabled={!canAccess?.("leads")}
              onClick={() => onNavigate("leads", { status })}
            >
              <span className="panel-stat-label">{leadStatusLabels[status]}</span>
              <span className={`panel-stat-value ${data.pipeline[status] ? "" : "is-zero"}`}>{data.pipeline[status]}</span>
            </button>
          ))}
          <div className="panel-stat">
            <span className="panel-stat-label">Ativos aguardando</span>
            <span className="panel-stat-value">
              {data.pipeline.NEW + data.pipeline.CONTACTED + data.pipeline.QUALIFIED}
            </span>
          </div>
        </div>
      </section>

      {vertical.showOccupancy && data.occupancy.length > 0 && (
        <section className="panel-block">
          <div className="panel-block-head">
            <h2>Ocupação da equipe</h2>
            <p>Atendimentos do dia por profissional</p>
          </div>
          <div className="panel-availability">
            {data.occupancy.map((entry) => (
              <div className="panel-availability-item" key={entry.professionalId}>
                <strong>{entry.name}</strong>
                <span>{entry.total} no dia · {entry.open} em aberto</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Atalhos</h2>
          <p>As filas que esta operação costuma abrir primeiro</p>
        </div>
        <div className="panel-shortcuts">
          {canAccess?.("leads") && vertical.leadShortcuts.map((shortcut) => (
            <button
              key={shortcut.id}
              className="panel-shortcut"
              type="button"
              onClick={() => onNavigate("leads", shortcut.filters)}
            >
              {shortcut.label}
            </button>
          ))}
          {canAccess?.("agenda") && (
            <button className="panel-shortcut" type="button" onClick={() => onNavigate("agenda", {})}>
              Agenda do dia
            </button>
          )}
          {canAccess?.("indicadores") && (
            <button className="panel-shortcut" type="button" onClick={() => onNavigate("indicadores", {})}>
              Indicadores
            </button>
          )}
          <button className="panel-shortcut" type="button" onClick={reload}>
            Atualizar dados
          </button>
        </div>
      </section>
    </>
  );
}
