import React, { useState } from "react";
import tenant from "../../config/tenant.js";
import { toId } from "../../utils/id.js";
import { api } from "../../services/api.js";
import { buildWaAction } from "../../utils/whatsapp.js";
import { usePanelData } from "../../utils/usePanelData.js";
import { PanelEmpty, PanelError, PanelLoading, PanelMessage, StatusPill } from "../../components/panel/PanelState.jsx";
import {
  delayLabel,
  followUpTypeLabels,
  formatDateTime,
  maskPhone,
  pageInfo,
  pageItems
} from "../../utils/panel.js";

const buckets = [
  { id: "overdue", label: "Vencidos" },
  { id: "today", label: "Hoje" },
  { id: "upcoming", label: "Próximos" },
  { id: "completed", label: "Concluídos" },
  { id: "cancelled", label: "Cancelados" }
];

function endOfTodayIso() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function startOfTomorrowIso() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return new Date(date.getTime() + 1).toISOString();
}

function bucketFilters(bucket, page) {
  const base = { page, limit: 20 };
  if (bucket === "overdue") return { ...base, overdue: true };
  if (bucket === "today") return { ...base, status: "OPEN", from: new Date().toISOString(), to: endOfTodayIso() };
  if (bucket === "upcoming") return { ...base, status: "OPEN", from: startOfTomorrowIso() };
  if (bucket === "completed") return { ...base, status: "COMPLETED" };
  return { ...base, status: "CANCELLED" };
}

function defaultNext() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return { dueAt: date.toISOString().slice(0, 16), type: "CONTACT", note: "" };
}

export default function FollowUps({ users, params, onNavigate, onSessionExpired }) {
  const [bucket, setBucket] = useState(params.bucket || "overdue");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [chainingId, setChainingId] = useState(null);
  const [next, setNext] = useState(defaultNext);

  const { state, data, error, reload } = usePanelData(
    () => api.getFollowUps(bucketFilters(bucket, page)),
    [bucket, page],
    onSessionExpired
  );

  const items = pageItems(data);
  const pagination = pageInfo(data);
  const activeUsers = users.filter((user) => user.active);

  function switchBucket(id) {
    setBucket(id);
    setPage(1);
    setChainingId(null);
  }

  async function run(followUp, action, successText) {
    setBusyId(followUp.id);
    setMessage(null);
    try {
      await action();
      setMessage({ type: "success", text: successText });
      await reload();
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    } finally {
      setBusyId(null);
    }
  }

  function completeWithNext(event, followUp) {
    event.preventDefault();
    run(followUp, () => api.completeFollowUp(followUp.id, {
      dueAt: new Date(next.dueAt).toISOString(),
      type: next.type,
      note: next.note,
      ownerUserId: followUp.ownerUserId || null
    }), "Follow-up concluído e próxima ação criada.").then(() => {
      setChainingId(null);
      setNext(defaultNext());
    });
  }

  return (
    <>
      <PanelMessage message={message} onDismiss={() => setMessage(null)} />

      <div className="panel-chips">
        {buckets.map((item) => (
          <button
            key={item.id}
            className="panel-chip"
            type="button"
            aria-pressed={bucket === item.id}
            onClick={() => switchBucket(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span className="panel-toolbar-spacer" />
        <button className="panel-btn" type="button" onClick={reload}>Atualizar</button>
      </div>

      {state === "loading" && !data && <PanelLoading rows={4} label="Carregando follow-ups…" />}
      {state === "error" && <PanelError onRetry={reload}>{error}</PanelError>}

      {data && (items.length === 0 ? (
        <PanelEmpty title={bucket === "overdue" ? "Nenhum follow-up vencido" : "Nada nesta lista"}>
          {bucket === "overdue"
            ? "As próximas ações combinadas estão em dia."
            : "Assim que houver registros nesta faixa, eles aparecem aqui."}
        </PanelEmpty>
      ) : (
        <>
          <div className="panel-list">
            {items.map((followUp) => {
              const delay = followUp.status === "OPEN" ? delayLabel(followUp.dueAt) : null;
              return (
                <div className="panel-row" key={followUp.id}>
                  <div className="panel-row-time">
                    {formatDateTime(followUp.dueAt).split(" ")[1] || ""}
                    <small>{formatDateTime(followUp.dueAt).split(" ")[0]}</small>
                  </div>
                  <div className="panel-row-main">
                    <strong>{followUp.client?.name || "Cliente"}</strong>
                    <span>
                      {maskPhone(followUp.client?.phone || "")}
                      {(() => {
                        const wa = buildWaAction({ phone: followUp.client?.phone, kind: "reminder", context: { cliente: followUp.client?.name || "", negocio: tenant?.name || "" } });
                        return wa ? <> · <a className="wa-link" href={wa.url} target="_blank" rel="noreferrer">WhatsApp</a></> : null;
                      })()}
                    </span>
                    <div className="panel-tags">
                      <span className="panel-tag">{followUpTypeLabels[followUp.type] || followUp.type}</span>
                      {delay && <span className="panel-tag is-alert">{delay}</span>}
                      {!followUp.ownerUserId && followUp.status === "OPEN" && (
                        <span className="panel-tag is-alert">Sem responsável</span>
                      )}
                    </div>
                  </div>
                  <div className="panel-row-cell">
                    {followUp.lead
                      ? <strong>Lead #{followUp.lead.id}</strong>
                      : <strong>Sem lead vinculado</strong>}
                    {followUp.note && <span>{followUp.note}</span>}
                  </div>
                  <div className="panel-row-cell">
                    {followUp.status === "OPEN" ? (
                      <>
                        <label className="sr-only" htmlFor={`owner-${followUp.id}`}>Responsável</label>
                        <select
                          id={`owner-${followUp.id}`}
                          value={followUp.ownerUserId || ""}
                          disabled={busyId === followUp.id}
                          onChange={(event) => run(
                            followUp,
                            () => api.assignFollowUpOwner(followUp.id, toId(event.target.value)),
                            "Responsável atualizado."
                          )}
                        >
                          <option value="">Sem responsável</option>
                          {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </select>
                      </>
                    ) : (
                      <strong>{followUp.owner?.name || "Sem responsável"}</strong>
                    )}
                  </div>
                  <div className="panel-row-status">
                    <StatusPill status={followUp.status} kind="followUp" />
                  </div>
                  <div className="panel-row-actions">
                    {followUp.status === "OPEN" && (
                      <>
                        <button
                          className="panel-btn-primary"
                          type="button"
                          disabled={busyId === followUp.id}
                          onClick={() => run(followUp, () => api.completeFollowUp(followUp.id), "Follow-up concluído.")}
                        >
                          Concluir
                        </button>
                        {followUp.leadId && (
                          <button
                            className="panel-btn"
                            type="button"
                            onClick={() => setChainingId(chainingId === followUp.id ? null : followUp.id)}
                          >
                            Concluir e criar próximo
                          </button>
                        )}
                        <button
                          className="panel-btn"
                          type="button"
                          disabled={busyId === followUp.id}
                          onClick={() => run(followUp, () => api.cancelFollowUp(followUp.id), "Follow-up cancelado.")}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                    {followUp.leadId && (
                      <button className="panel-btn" type="button" onClick={() => onNavigate("leads", { leadId: followUp.leadId })}>
                        Lead
                      </button>
                    )}
                    <button className="panel-btn" type="button" onClick={() => onNavigate("clientes", { clientId: followUp.clientId })}>
                      Cliente
                    </button>
                  </div>

                  {chainingId === followUp.id && (
                    <form
                      className="panel-inline-form"
                      style={{ gridColumn: "1 / -1" }}
                      onSubmit={(event) => completeWithNext(event, followUp)}
                    >
                      <label className="panel-field">
                        Próxima ação em
                        <input
                          type="datetime-local"
                          value={next.dueAt}
                          onChange={(event) => setNext({ ...next, dueAt: event.target.value })}
                          required
                        />
                      </label>
                      <label className="panel-field">
                        Tipo
                        <select value={next.type} onChange={(event) => setNext({ ...next, type: event.target.value })}>
                          {Object.entries(followUpTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="panel-field" style={{ flex: "1 1 220px" }}>
                        Orientação
                        <input
                          type="text"
                          maxLength="500"
                          value={next.note}
                          onChange={(event) => setNext({ ...next, note: event.target.value })}
                          placeholder="O que precisa ser feito"
                        />
                      </label>
                      <button className="panel-btn-primary" type="submit" disabled={busyId === followUp.id}>
                        Concluir e agendar
                      </button>
                      <button className="panel-btn" type="button" onClick={() => setChainingId(null)}>Cancelar</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          <div className="panel-pagination">
            <button className="panel-btn" type="button" disabled={pagination.page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>Página {pagination.page} de {pagination.pages} · {pagination.total} registro(s)</span>
            <button
              className="panel-btn"
              type="button"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      ))}
    </>
  );
}
