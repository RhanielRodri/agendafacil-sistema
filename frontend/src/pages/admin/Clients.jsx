import React, { useEffect, useState } from "react";
import tenant from "../../config/tenant.js";
import { toId } from "../../utils/id.js";
import { api } from "../../services/api.js";
import { usePanelData } from "../../utils/usePanelData.js";
import ManualWhatsapp from "../../components/panel/ManualWhatsapp.jsx";
import { PanelEmpty, PanelError, PanelLoading, PanelMessage, StatusPill } from "../../components/panel/PanelState.jsx";
import RowActions from "../../components/panel/RowActions.jsx";
import {
  followUpTypeLabels,
  formatDateTime,
  leadSourceLabels,
  leadStatusLabels,
  pageInfo,
  pageItems,
  relativeDayLabel,
  todayIso
} from "../../utils/panel.js";
import { relationshipHistoryLabels } from "../../utils/relationshipHistory.js";

const dependencyLabels = {
  appointments: "Agendamentos",
  leads: "Leads",
  followUps: "Follow-ups",
  history: "Eventos no histórico"
};

function DeleteClientPanel({ candidate, conflict, busy, onConfirm, onCancel }) {
  if (!candidate) return null;
  const dependencies = conflict
    ? Object.entries(conflict).filter(([, total]) => total > 0)
    : [];

  return (
    <div className="panel-conflict" role="alertdialog" aria-label={`Excluir ${candidate.name}`}>
      <strong>
        {conflict
          ? `${candidate.name} não pode ser excluído`
          : `Excluir definitivamente ${candidate.name}?`}
      </strong>
      <p>
        {conflict
          ? "Este cadastro precisa ser preservado porque possui dados vinculados."
          : "Esta ação é permanente e só será concluída se o cadastro não tiver agendamentos nem histórico."}
      </p>
      {dependencies.length > 0 && (
        <ul>
          {dependencies.map(([key, total]) => (
            <li key={key}>
              <strong>{dependencyLabels[key] || key}</strong>
              <span>{total} registro(s) vinculado(s)</span>
            </li>
          ))}
        </ul>
      )}
      <div className="panel-conflict-actions">
        {!conflict && (
          <button className="panel-btn-danger" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Excluindo…" : "Excluir definitivamente"}
          </button>
        )}
        <button className="panel-btn" type="button" onClick={onCancel}>
          {conflict ? "Entendi" : "Cancelar"}
        </button>
      </div>
    </div>
  );
}

export default function Clients({ params, onNavigate, onSessionExpired, canAccess }) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(toId(params.clientId));
  const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState("idle");
  const [history, setHistory] = useState([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleteConflict, setDeleteConflict] = useState(null);
  const lifecycleEnabled = typeof api.archiveClient === "function";

  const { state, data, error, reload } = usePanelData(
    () => api.getClients({
      search,
      page,
      limit: 20,
      ...(lifecycleEnabled ? { status: statusFilter } : {})
    }),
    [search, statusFilter, page],
    onSessionExpired
  );

  const items = pageItems(data);
  const pagination = pageInfo(data);

  async function openClient(id) {
    setSelectedId(id);
    setDetailState("loading");
    setMessage(null);
    try {
      const [client, clientHistory] = await Promise.all([api.getClient(id), api.getClientHistory(id)]);
      setDetail(client);
      setHistory(clientHistory);
      setDetailState("ready");
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
      setDetailState("error");
    }
  }

  useEffect(() => {
    if (selectedId && !detail) openClient(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitNote(event) {
    event.preventDefault();
    try {
      await api.addClientNote(selectedId, note);
      setNote("");
      setMessage({ type: "success", text: "Nota registrada no histórico comercial." });
      setHistory(await api.getClientHistory(selectedId));
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    }
  }

  function applySearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  function closeDetail() {
    setDetail(null);
    setSelectedId(null);
    setDetailState("idle");
  }

  async function changeArchiveState(client, archived) {
    setBusyId(client.id);
    setMessage(null);
    try {
      if (archived) {
        await api.archiveClient(client.id);
      } else {
        await api.restoreClient(client.id);
      }
      if (selectedId === client.id) closeDetail();
      setMessage({
        type: "success",
        text: archived ? `${client.name} foi arquivado.` : `${client.name} foi restaurado.`
      });
      await reload();
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    } finally {
      setBusyId(null);
    }
  }

  function askDelete(client) {
    setDeleteCandidate(client);
    setDeleteConflict(null);
    setMessage(null);
  }

  async function confirmDelete() {
    if (!deleteCandidate) return;
    setBusyId(deleteCandidate.id);
    try {
      await api.deleteClient(deleteCandidate.id);
      if (selectedId === deleteCandidate.id) closeDetail();
      setMessage({ type: "success", text: `${deleteCandidate.name} foi excluído definitivamente.` });
      setDeleteCandidate(null);
      setDeleteConflict(null);
      await reload();
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      if (failure.status === 409 && failure.dependencies) {
        setDeleteConflict(failure.dependencies);
      } else {
        setMessage({ type: "error", text: failure.message });
        setDeleteCandidate(null);
      }
    } finally {
      setBusyId(null);
    }
  }

  const today = todayIso();
  const upcoming = detail?.appointments.filter((appointment) => appointment.date.slice(0, 10) >= today) || [];
  const past = detail?.appointments.filter((appointment) => appointment.date.slice(0, 10) < today) || [];
  const openFollowUps = detail?.followUps.filter((followUp) => followUp.status === "OPEN") || [];

  return (
    <>
      <PanelMessage message={message} onDismiss={() => setMessage(null)} />
      <DeleteClientPanel
        candidate={deleteCandidate}
        conflict={deleteConflict}
        busy={busyId === deleteCandidate?.id}
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteCandidate(null); setDeleteConflict(null); }}
      />

      <form className="panel-toolbar" onSubmit={applySearch}>
        <label className="sr-only" htmlFor="client-search">Buscar cliente por nome ou telefone</label>
        <input
          id="client-search"
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Buscar por nome ou telefone"
          style={{ flex: "1 1 220px" }}
        />
        <button className="panel-btn-primary" type="submit">Buscar</button>
        {search && (
          <button className="panel-btn" type="button" onClick={() => { setSearchDraft(""); setSearch(""); setPage(1); }}>
            Limpar
          </button>
        )}
        {lifecycleEnabled && (
          <div className="panel-segmented" role="group" aria-label="Situação dos clientes">
            {[
              ["active", "Ativos"],
              ["archived", "Arquivados"],
              ["all", "Todos"]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => {
                  setStatusFilter(value);
                  setPage(1);
                  closeDetail();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <span className="panel-toolbar-spacer" />
        <button className="panel-btn" type="button" onClick={reload}>Atualizar</button>
      </form>

      {state === "loading" && !data && <PanelLoading rows={4} label="Carregando clientes…" />}
      {state === "error" && <PanelError onRetry={reload}>{error}</PanelError>}

      {data && (items.length === 0 ? (
        <PanelEmpty
          title={search
            ? "Sem resultados"
            : statusFilter === "archived" ? "Nenhum cliente arquivado" : "Nenhum cliente cadastrado"}
          actionLabel={search ? "Limpar busca" : undefined}
          onAction={search ? () => { setSearchDraft(""); setSearch(""); } : undefined}
        >
          {search
            ? "Nenhum cliente corresponde a essa busca."
            : statusFilter === "archived"
              ? "Cadastros arquivados aparecerão aqui."
              : "Clientes aparecem aqui após o primeiro agendamento ou lead."}
        </PanelEmpty>
      ) : (
        <>
          <div className="panel-list">
            {items.map((client) => (
              <div className={`panel-row${client.archived ? " panel-row--muted" : ""}`} key={client.id}>
                <div className="panel-row-time">
                  <span className="panel-avatar" aria-hidden="true">
                    {(client.name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="panel-row-main">
                  <strong>{client.name}</strong>
                  <span>{client.phone}</span>
                </div>
                <div className="panel-row-cell">
                  <strong>{client._count?.appointments ?? 0} agendamento(s)</strong>
                  <span>{client._count?.leads ?? 0} lead(s) · {client._count?.followUps ?? 0} follow-up(s)</span>
                </div>
                <div className="panel-row-cell">
                  <strong>Último contato</strong>
                  <span>{formatDateTime(client.lastContactAt)}</span>
                </div>
                <div className="panel-row-status">
                  {client.archived && <span className="panel-tag">Arquivado</span>}
                </div>
                <RowActions
                  primary={[
                    {
                      key: "open",
                      label: "Abrir ficha",
                      className: "panel-btn-primary",
                      onClick: () => openClient(client.id)
                    }
                  ]}
                  secondary={lifecycleEnabled ? [
                    client.archived
                      ? {
                          key: "restore",
                          label: "Restaurar",
                          onClick: () => changeArchiveState(client, false),
                          disabled: busyId === client.id
                        }
                      : {
                          key: "archive",
                          label: "Arquivar",
                          onClick: () => changeArchiveState(client, true),
                          disabled: busyId === client.id
                        },
                    {
                      key: "delete",
                      label: "Excluir",
                      className: "panel-btn-danger",
                      danger: true,
                      onClick: () => askDelete(client),
                      disabled: busyId === client.id
                    }
                  ] : []}
                />
              </div>
            ))}
          </div>

          <div className="panel-pagination">
            <button className="panel-btn" type="button" disabled={pagination.page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>Página {pagination.page} de {pagination.pages} · {pagination.total} cliente(s)</span>
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

      {detailState === "loading" && <PanelLoading rows={3} label="Carregando ficha…" />}

      {detail && detailState === "ready" && (
        <div className="panel-detail">
          <div className="panel-detail-head">
            <div>
              <h3>{detail.name}</h3>
              <p>
                {detail.phone}{detail.email ? ` · ${detail.email}` : ""}
              </p>
            </div>
            <button className="panel-btn" type="button" onClick={closeDetail}>
              Fechar ficha
            </button>
          </div>

          <ManualWhatsapp
            phone={detail.phone}
            clientId={detail.id}
            initialTemplate="return"
            context={{ cliente: detail.name, negocio: tenant?.name || "" }}
          />

          <div className="panel-detail-facts">
            <div>
              <span>Primeiro contato</span>
              <strong>{formatDateTime(detail.firstContactAt)}</strong>
            </div>
            <div>
              <span>Último contato</span>
              <strong>{formatDateTime(detail.lastContactAt)}</strong>
            </div>
            <div>
              <span>Último atendimento</span>
              <strong>{past[0] ? relativeDayLabel(past[0].date.slice(0, 10)) : "Sem histórico"}</strong>
            </div>
            <div>
              <span>Próximo agendamento</span>
              <strong>
                {upcoming.length
                  ? `${relativeDayLabel(upcoming[upcoming.length - 1].date.slice(0, 10))} · ${upcoming[upcoming.length - 1].time}`
                  : "Nenhum"}
              </strong>
            </div>
            <div>
              <span>Follow-ups abertos</span>
              <strong>{openFollowUps.length}</strong>
            </div>
          </div>

          <div className="panel-detail-grid">
            <section className="panel-detail-section">
              <h4>Agendamentos</h4>
              <div className="panel-item-list">
                {detail.appointments.length === 0 && <p>Nenhum agendamento registrado.</p>}
                {detail.appointments.slice(0, 8).map((appointment) => (
                  <div className="panel-item" key={appointment.id}>
                    <strong>{appointment.service.name}</strong>
                    <span>
                      {relativeDayLabel(appointment.date.slice(0, 10))} · {appointment.time} · {appointment.professional.name}
                    </span>
                    <div className="panel-tags"><StatusPill status={appointment.status} /></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-detail-section">
              <h4>Leads</h4>
              <div className="panel-item-list">
                {detail.leads.length === 0 && <p>Nenhum lead vinculado.</p>}
                {detail.leads.map((lead) => (
                  <div className="panel-item" key={lead.id}>
                    <strong>{lead.service?.name || lead.interestSummary || "Interesse não informado"}</strong>
                    <span>
                      {leadStatusLabels[lead.status]} · {leadSourceLabels[lead.source]}
                    </span>
                    {canAccess?.("leads") && (
                      <button className="panel-btn-link" type="button" onClick={() => onNavigate("leads", { leadId: lead.id })}>
                        Abrir lead
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-detail-section">
              <h4>Follow-ups</h4>
              <div className="panel-item-list">
                {detail.followUps.length === 0 && <p>Nenhuma próxima ação registrada.</p>}
                {detail.followUps.slice(0, 8).map((followUp) => (
                  <div className="panel-item" key={followUp.id}>
                    <strong>{followUpTypeLabels[followUp.type] || followUp.type}</strong>
                    <span>{formatDateTime(followUp.dueAt)}</span>
                    <div className="panel-tags"><StatusPill status={followUp.status} kind="followUp" /></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-detail-section">
              <h4>Notas e histórico comercial</h4>
              <form className="panel-inline-form" onSubmit={submitNote} style={{ marginTop: 0, borderTop: "none", paddingTop: 0 }}>
                <label className="panel-field" style={{ flex: "1 1 200px" }}>
                  Nova nota
                  <input
                    type="text"
                    maxLength="500"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Registro comercial curto"
                    required
                  />
                </label>
                <button className="panel-btn-primary" type="submit">Adicionar</button>
              </form>
              <ol className="panel-history">
                {history.length === 0 && <li>Sem eventos comerciais registrados.</li>}
                {[...history].reverse().map((event) => (
                  <li key={event.id}>
                    <strong>{relationshipHistoryLabels[event.type] || event.type}</strong>
                    {event.metadata?.content && <p>{event.metadata.content}</p>}
                    <span>{formatDateTime(event.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
