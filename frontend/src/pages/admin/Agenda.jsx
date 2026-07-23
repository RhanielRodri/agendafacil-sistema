import React, { useState } from "react";
import tenant from "../../config/tenant.js";
import { api } from "../../services/api.js";
import { usePanelData } from "../../utils/usePanelData.js";
import ManualWhatsapp from "../../components/panel/ManualWhatsapp.jsx";
import { PanelEmpty, PanelError, PanelLoading, PanelMessage, StatusPill } from "../../components/panel/PanelState.jsx";
import {
  appointmentStatusLabels,
  appointmentStatuses,
  appointmentTransitions,
  formatMinutes,
  leadSourceLabels,
  relativeDayLabel,
  shiftIsoDay,
  todayIso
} from "../../utils/panel.js";

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

export default function Agenda({ professionals, params, onNavigate, onSessionExpired }) {
  const [date, setDate] = useState(params.date || todayIso());
  const [professionalId, setProfessionalId] = useState(params.professionalId || "");
  const [status, setStatus] = useState(params.status || "");
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [reason, setReason] = useState({});
  const [historyById, setHistoryById] = useState({});
  const [historyLoadingId, setHistoryLoadingId] = useState(null);

  const { state, data, error, reload } = usePanelData(
    () => api.getAgendaDay({ date, professionalId, status }),
    [date, professionalId, status],
    onSessionExpired
  );

  async function applyAction(appointment, nextStatus) {
    setBusyId(appointment.id);
    setMessage(null);
    try {
      await api.updateAppointmentStatus(appointment.id, nextStatus, reason[appointment.id] || "");
      setReason((current) => ({ ...current, [appointment.id]: "" }));
      setHistoryById((current) => ({ ...current, [appointment.id]: undefined }));
      setMessage({
        type: "success",
        text: `${appointment.clientName}: ${appointmentStatusLabels[nextStatus].toLowerCase()}.`
      });
      await reload();
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleHistory(appointment) {
    if (historyById[appointment.id]) {
      setHistoryById((current) => ({ ...current, [appointment.id]: undefined }));
      return;
    }
    setHistoryLoadingId(appointment.id);
    try {
      const history = await api.getAppointmentHistory(appointment.id);
      setHistoryById((current) => ({ ...current, [appointment.id]: history }));
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    } finally {
      setHistoryLoadingId(null);
    }
  }

  const hasFilters = Boolean(professionalId || status);

  return (
    <>
      <PanelMessage message={message} onDismiss={() => setMessage(null)} />

      <div className="panel-toolbar">
        <div className="panel-daynav">
          <button className="panel-btn" type="button" onClick={() => setDate(shiftIsoDay(date, -1))} aria-label="Dia anterior">←</button>
          <strong>{relativeDayLabel(date)}</strong>
          <button className="panel-btn" type="button" onClick={() => setDate(shiftIsoDay(date, 1))} aria-label="Próximo dia">→</button>
        </div>
        <label className="sr-only" htmlFor="agenda-date">Data da agenda</label>
        <input id="agenda-date" type="date" value={date} onChange={(event) => setDate(event.target.value || todayIso())} />
        {date !== todayIso() && (
          <button className="panel-btn" type="button" onClick={() => setDate(todayIso())}>Hoje</button>
        )}

        <label className="sr-only" htmlFor="agenda-professional">Profissional</label>
        <select id="agenda-professional" value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
          <option value="">Todos os profissionais</option>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>{professional.name}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="agenda-status">Status</label>
        <select id="agenda-status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Todos os status</option>
          {appointmentStatuses.map((value) => (
            <option key={value} value={value}>{appointmentStatusLabels[value]}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="panel-btn" type="button" onClick={() => { setProfessionalId(""); setStatus(""); }}>
            Limpar filtros
          </button>
        )}
        <span className="panel-toolbar-spacer" />
        <button className="panel-btn" type="button" onClick={reload}>Atualizar</button>
        <button className="panel-btn" type="button" onClick={() => window.open(api.getExportUrl(), "_blank", "noopener")}>
          Exportar CSV
        </button>
      </div>

      {state === "loading" && !data && <PanelLoading rows={5} label="Carregando agenda…" />}
      {state === "error" && <PanelError onRetry={reload}>{error}</PanelError>}

      {data && (
        <>
          <section className="panel-block">
            <div className="panel-block-head">
              <h2>Disponibilidade do dia</h2>
              <p>
                {data.summary.total} agendamento(s) ·
                {" "}{appointmentStatuses
                  .filter((value) => data.summary.byStatus[value])
                  .map((value) => `${data.summary.byStatus[value]} ${appointmentStatusLabels[value].toLowerCase()}`)
                  .join(" · ") || "nenhum registro"}
              </p>
            </div>

            {data.availability.length > 0 && (
              <div className="panel-availability">
                {data.availability.map((entry) => (
                  <div className="panel-availability-item" key={entry.professionalId}>
                    <strong>{entry.name}</strong>
                    <span>
                      {entry.working
                        ? `${formatMinutes(entry.bookedMinutes)} ocupados · ${formatMinutes(entry.freeMinutes)} livres`
                        : "Sem expediente neste dia"}
                    </span>
                    {entry.working && entry.openMinutes > 0 && (
                      <div className="panel-availability-bar">
                        <i style={{ width: `${Math.min(100, Math.round((entry.bookedMinutes / entry.openMinutes) * 100))}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.blocks.map((block) => (
              <p className="panel-notice" key={block.id}>
                {block.allDay ? "Bloqueio de dia inteiro" : `Pausa ${block.startTime}–${block.endTime}`}
                {" · "}{block.professionalName || "Todo o negócio"}
                {block.reason ? ` · ${block.reason}` : ""}
              </p>
            ))}
          </section>

          <section className="panel-block">
            <div className="panel-block-head">
              <h2>Atendimentos</h2>
              {data.items.length >= 100 && <p>Mostrando os 100 primeiros horários do dia.</p>}
            </div>

            {data.items.length === 0 ? (
              <PanelEmpty
                title={hasFilters ? "Sem resultados para o filtro" : "Nenhum atendimento neste dia"}
                actionLabel={hasFilters ? "Limpar filtros" : undefined}
                onAction={hasFilters ? () => { setProfessionalId(""); setStatus(""); } : undefined}
              >
                {hasFilters ? "Ajuste profissional ou status para ampliar a busca." : "A agenda deste dia está livre."}
              </PanelEmpty>
            ) : (
              <div className="panel-list">
                <div className="panel-list-head" aria-hidden="true">
                  <span>Hora</span>
                  <span>Cliente</span>
                  <span>Procedimento</span>
                  <span>Profissional</span>
                  <span>Status</span>
                  <span />
                </div>
                {data.items.map((appointment) => {
                  const actions = appointmentTransitions[appointment.status] || [];
                  return (
                    <div className="panel-row" key={appointment.id}>
                      <div className="panel-row-time">
                        {appointment.time}
                        <small>até {appointment.endTime}</small>
                      </div>
                      <div className="panel-row-main">
                        <strong>{appointment.clientName}</strong>
                        <span>
                          {appointment.clientPhone}
                        </span>
                        <div className="panel-tags">
                          {appointment.leadSource && <span className="panel-tag">{leadSourceLabels[appointment.leadSource]}</span>}
                          {appointment.rescheduledFromId && <span className="panel-tag">Reagendado de #{appointment.rescheduledFromId}</span>}
                          {appointment.rescheduledToId && <span className="panel-tag">Substituído por #{appointment.rescheduledToId}</span>}
                        </div>
                      </div>
                      <div className="panel-row-cell">
                        <strong>{appointment.serviceName}</strong>
                        <span>{appointment.durationMinutes} min</span>
                      </div>
                      <div className="panel-row-cell">
                        <strong>{appointment.professionalName}</strong>
                        {appointment.cancellationReason && <span>Motivo: {appointment.cancellationReason}</span>}
                      </div>
                      <div className="panel-row-status">
                        <StatusPill status={appointment.status} />
                      </div>
                      <div className="panel-row-actions">
                        {actions.length > 0 && (
                          <>
                            <label className="sr-only" htmlFor={`reason-${appointment.id}`}>Motivo opcional</label>
                            <input
                              id={`reason-${appointment.id}`}
                              type="text"
                              maxLength="300"
                              placeholder="Motivo opcional"
                              value={reason[appointment.id] || ""}
                              onChange={(event) => setReason((current) => ({ ...current, [appointment.id]: event.target.value }))}
                              style={{ maxWidth: 150 }}
                            />
                            {actions.map((action) => (
                              <button
                                key={action.status}
                                className={action.primary ? "panel-btn-primary" : "panel-btn"}
                                type="button"
                                disabled={busyId === appointment.id}
                                onClick={() => applyAction(appointment, action.status)}
                              >
                                {action.label}
                              </button>
                            ))}
                          </>
                        )}
                        <button className="panel-btn" type="button" onClick={() => toggleHistory(appointment)}>
                          {historyLoadingId === appointment.id
                            ? "Carregando…"
                            : historyById[appointment.id] ? "Ocultar histórico" : "Histórico"}
                        </button>
                        <button
                          className="panel-btn"
                          type="button"
                          onClick={() => onNavigate("clientes", { clientId: appointment.clientId })}
                        >
                          Cliente
                        </button>
                        {appointment.leadId && (
                          <button
                            className="panel-btn"
                            type="button"
                            onClick={() => onNavigate("leads", { leadId: appointment.leadId })}
                          >
                            Lead
                          </button>
                        )}
                      </div>
                      <ManualWhatsapp
                        phone={appointment.clientPhone}
                        clientId={appointment.clientId}
                        leadId={appointment.leadId}
                        initialTemplate={appointment.status === "PENDING" ? "confirmation" : "reminder"}
                        context={{
                          cliente: appointment.clientName,
                          negocio: tenant?.name || "",
                          servico: appointment.serviceName,
                          profissional: appointment.professionalName,
                          data: appointment.date || "",
                          hora: appointment.time
                        }}
                      />
                      {historyById[appointment.id] && (
                        <ol className="panel-history" style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                          {historyById[appointment.id].map((event) => (
                            <li key={event.id}>
                              <strong>{historyLabels[event.type] || event.type}</strong>
                              <span>{new Date(event.createdAt).toLocaleString("pt-BR")}</span>
                              {event.metadata?.reason && <p>Motivo: {event.metadata.reason}</p>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
