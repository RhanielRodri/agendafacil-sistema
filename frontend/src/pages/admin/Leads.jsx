import React, { useMemo, useState } from "react";
import { toId } from "../../utils/id.js";
import { api } from "../../services/api.js";
import { usePanelData } from "../../utils/usePanelData.js";
import { PanelEmpty, PanelError, PanelLoading, PanelMessage, StatusPill } from "../../components/panel/PanelState.jsx";
import {
  activeLeadStatuses,
  delayLabel,
  followUpTypeLabels,
  formatDateTime,
  leadPriorityLabels,
  leadSourceLabels,
  leadStatusLabels,
  leadStatuses,
  lostReasonLabels,
  maskPhone,
  pageInfo,
  pageItems,
  todayIso
} from "../../utils/panel.js";
import { relationshipHistoryLabels } from "../../utils/relationshipHistory.js";

const nextStatuses = {
  NEW: ["CONTACTED", "QUALIFIED"],
  CONTACTED: ["QUALIFIED"],
  QUALIFIED: [],
  CONVERTED: [],
  LOST: []
};

const views = [
  { id: "pipeline", label: "Pipeline" },
  { id: "list", label: "Lista compacta" },
  { id: "attention", label: "Precisam de atenção" }
];

function baseFilters(params) {
  return {
    search: "",
    status: params.status || "",
    source: params.source || "",
    priority: params.priority || "",
    ownerUserId: "",
    service: "",
    overdue: params.overdue || false,
    noNextAction: params.noNextAction || false,
    unassigned: params.unassigned || false,
    createdFrom: "",
    page: 1,
    limit: 20
  };
}

function futureDateTime(hours = 24) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function futureDate(days = 1) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function emptyFollowUp(lead) {
  return {
    dueAt: futureDateTime(),
    type: "CONTACT",
    ownerUserId: lead?.ownerUserId ? String(lead.ownerUserId) : "",
    note: ""
  };
}

function qualificationForm(lead, tenantId) {
  const saved = lead?.qualification || {};
  const shared = {
    firstVisit: saved.firstVisit ?? false,
    preferredProfessionalId: saved.preferredProfessionalId ? String(saved.preferredProfessionalId) : "",
    availability: saved.availability || "",
    commercialNote: saved.commercialNote || "",
    bestContactPeriod: saved.bestContactPeriod || "ANY"
  };
  if (tenantId === "lumiere") {
    return {
      ...shared,
      procedureInterest: saved.procedureInterest || lead?.service?.name || "",
      requestsEvaluation: saved.requestsEvaluation ?? true,
      statedGoal: saved.statedGoal || "",
      packageInterest: saved.packageInterest ?? false
    };
  }
  return {
    ...shared,
    serviceInterest: saved.serviceInterest || lead?.service?.name || "",
    acceptsAnyProfessional: saved.acceptsAnyProfessional ?? true,
    wantsImmediateOpening: saved.wantsImmediateOpening ?? false,
    urgency: saved.urgency || "FLEXIBLE"
  };
}

export default function Leads({ tenantId, vertical, services, professionals, users, params, onNavigate, onSessionExpired }) {
  const [view, setView] = useState(params.leadId ? "list" : "pipeline");
  const [filters, setFilters] = useState(() => baseFilters(params));
  const [draft, setDraft] = useState(() => baseFilters(params));
  const [message, setMessage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailState, setDetailState] = useState("idle");
  const [clientAppointments, setClientAppointments] = useState([]);
  const [qualification, setQualification] = useState({});
  const [followUpForm, setFollowUpForm] = useState(emptyFollowUp());
  const [note, setNote] = useState("");
  const [loss, setLoss] = useState({ lostReason: "NO_RESPONSE", lostReasonNote: "" });
  const [appointmentId, setAppointmentId] = useState("");
  const [appointmentForm, setAppointmentForm] = useState({ serviceId: "", professionalId: "", date: futureDate(), time: "09:00" });

  const effectiveFilters = view === "attention"
    ? { ...filters, overdue: false, noNextAction: false, unassigned: false, attention: true }
    : filters;

  const { state, data, error, reload } = usePanelData(
    () => api.getLeads(effectiveFilters),
    [JSON.stringify(effectiveFilters)],
    onSessionExpired
  );

  const leads = pageItems(data);
  const pagination = pageInfo(data);
  const activeUsers = users.filter((user) => user.active);

  const grouped = useMemo(() => Object.fromEntries(
    leadStatuses.map((status) => [status, leads.filter((lead) => lead.status === status)])
  ), [leads]);

  const activeShortcut = vertical.leadShortcuts.find((shortcut) => (
    Object.entries(shortcut.filters).every(([key, value]) => (
      key === "newToday" ? filters.createdFrom === todayIso() : filters[key] === value
    ))
  ));

  function applyShortcut(shortcut) {
    const clean = baseFilters({});
    if (activeShortcut?.id === shortcut.id) {
      setFilters(clean);
      setDraft(clean);
      return;
    }
    const next = shortcut.filters.newToday
      ? { ...clean, createdFrom: todayIso() }
      : { ...clean, ...shortcut.filters };
    setFilters(next);
    setDraft(next);
  }

  async function openLead(id, keepMessage = false) {
    setDetailState("loading");
    if (!keepMessage) setMessage(null);
    try {
      const lead = await api.getLead(id);
      const client = await api.getClient(lead.clientId);
      setSelected(lead);
      setClientAppointments(client.appointments.filter((appointment) => appointment.status !== "CANCELLED"));
      setQualification(qualificationForm(lead, tenantId));
      setFollowUpForm(emptyFollowUp(lead));
      setAppointmentId(lead.convertedAppointmentId ? String(lead.convertedAppointmentId) : "");
      setAppointmentForm({
        serviceId: lead.serviceId ? String(lead.serviceId) : String(services[0]?.id || ""),
        professionalId: lead.professionalId ? String(lead.professionalId) : String(professionals[0]?.id || ""),
        date: futureDate(),
        time: "09:00"
      });
      setDetailState("ready");
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
      setDetailState("error");
    }
  }

  React.useEffect(() => {
    if (params.leadId) openLead(toId(params.leadId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mutate(action, successText, leadId = selected?.id) {
    setMessage(null);
    try {
      await action();
      setMessage({ type: "success", text: successText });
      await reload();
      if (leadId) await openLead(leadId, true);
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    }
  }

  function submitFilters(event) {
    event.preventDefault();
    setFilters({ ...draft, page: 1 });
  }

  function clearFilters() {
    const clean = baseFilters({});
    setDraft(clean);
    setFilters(clean);
  }

  const hasFilters = Object.entries(filters).some(([key, value]) => !["page", "limit"].includes(key) && Boolean(value));

  function leadTags(lead) {
    return (
      <div className="panel-tags">
        <span className="panel-tag">{leadSourceLabels[lead.source]}</span>
        {lead.priority !== "NORMAL" && <span className="panel-tag">{leadPriorityLabels[lead.priority]}</span>}
        {lead.overdue && <span className="panel-tag is-alert">{delayLabel(lead.nextFollowUp.dueAt)}</span>}
        {!lead.nextFollowUp && activeLeadStatuses.includes(lead.status) && (
          <span className="panel-tag is-alert">Sem próxima ação</span>
        )}
        {!lead.ownerUserId && activeLeadStatuses.includes(lead.status) && (
          <span className="panel-tag is-alert">Sem responsável</span>
        )}
      </div>
    );
  }

  return (
    <>
      <PanelMessage message={message} onDismiss={() => setMessage(null)} />

      <div className="panel-chips">
        {views.map((item) => (
          <button
            key={item.id}
            className="panel-chip"
            type="button"
            aria-pressed={view === item.id}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="panel-chips">
        {vertical.leadShortcuts.map((shortcut) => (
          <button
            key={shortcut.id}
            className="panel-chip"
            type="button"
            aria-pressed={activeShortcut?.id === shortcut.id}
            onClick={() => applyShortcut(shortcut)}
          >
            {shortcut.label}
          </button>
        ))}
      </div>

      <form className="panel-toolbar" onSubmit={submitFilters}>
        <label className="sr-only" htmlFor="lead-search">Buscar lead</label>
        <input
          id="lead-search"
          type="search"
          value={draft.search}
          onChange={(event) => setDraft({ ...draft, search: event.target.value })}
          placeholder="Buscar nome, telefone ou interesse"
          style={{ flex: "1 1 200px" }}
        />
        <label className="sr-only" htmlFor="lead-status">Etapa</label>
        <select id="lead-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
          <option value="">Todas as etapas</option>
          {leadStatuses.map((status) => <option key={status} value={status}>{leadStatusLabels[status]}</option>)}
        </select>
        <label className="sr-only" htmlFor="lead-priority">Prioridade</label>
        <select id="lead-priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
          <option value="">Todas as prioridades</option>
          {Object.entries(leadPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="sr-only" htmlFor="lead-owner">Responsável</label>
        <select id="lead-owner" value={draft.ownerUserId} onChange={(event) => setDraft({ ...draft, ownerUserId: event.target.value })}>
          <option value="">Todos os responsáveis</option>
          {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="lead-source">Origem</label>
        <select id="lead-source" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}>
          <option value="">Todas as origens</option>
          {Object.entries(leadSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="sr-only" htmlFor="lead-service">Serviço</label>
        <select id="lead-service" value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })}>
          <option value="">Todos os serviços</option>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select>
        <button className="panel-btn-primary" type="submit">Filtrar</button>
        {hasFilters && <button className="panel-btn" type="button" onClick={clearFilters}>Limpar</button>}
      </form>

      {state === "loading" && !data && <PanelLoading rows={4} label="Carregando leads…" />}
      {state === "error" && <PanelError onRetry={reload}>{error}</PanelError>}

      {data && pagination.total === 0 && (
        <PanelEmpty
          title={hasFilters || view === "attention" ? "Sem resultados" : "Nenhum lead registrado"}
          actionLabel={hasFilters ? "Limpar filtros" : undefined}
          onAction={hasFilters ? clearFilters : undefined}
        >
          {view === "attention"
            ? "Nenhum lead ativo está vencido, sem próxima ação ou sem responsável."
            : hasFilters ? "Ajuste os filtros para ampliar a busca." : "Novos pedidos aparecem aqui automaticamente."}
        </PanelEmpty>
      )}

      {data && pagination.total > 0 && view === "pipeline" && (
        <div className="panel-pipeline">
          {leadStatuses.map((status) => (
            <section className="panel-pipeline-column" key={status}>
              <header className="panel-pipeline-head">
                <span>{leadStatusLabels[status]}</span>
                <span>{grouped[status].length}</span>
              </header>
              <div className="panel-pipeline-body">
                {grouped[status].length === 0 && <p className="panel-pipeline-empty">Nenhum nesta página</p>}
                {grouped[status].map((lead) => (
                  <article className={`panel-lead-card priority-${lead.priority.toLowerCase()}`} key={lead.id}>
                    <strong>{lead.client.name}</strong>
                    <p>{lead.service?.name || lead.interestSummary || "Interesse não informado"}</p>
                    <small>{lead.owner?.name || "Sem responsável"}</small>
                    {leadTags(lead)}
                    <div className="panel-row-actions" style={{ justifyContent: "flex-start", marginTop: 6 }}>
                      {nextStatuses[lead.status].map((next) => (
                        <button
                          key={next}
                          className="panel-btn"
                          type="button"
                          onClick={() => mutate(() => api.updateLeadStatus(lead.id, next), "Etapa atualizada.", lead.id)}
                        >
                          {leadStatusLabels[next]}
                        </button>
                      ))}
                      <button className="panel-btn-primary" type="button" onClick={() => openLead(lead.id)}>Ficha</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {data && pagination.total > 0 && view !== "pipeline" && (
        <div className="panel-list">
          {leads.map((lead) => (
            <div className="panel-row" key={lead.id}>
              <div className="panel-row-time">
                #{lead.id}
                <small>{new Date(lead.createdAt).toLocaleDateString("pt-BR")}</small>
              </div>
              <div className="panel-row-main">
                <strong>{lead.client.name}</strong>
                <span>{maskPhone(lead.client.phone)}</span>
                {leadTags(lead)}
              </div>
              <div className="panel-row-cell">
                <strong>{lead.service?.name || lead.interestSummary || "Interesse não informado"}</strong>
                <span>{lead.owner?.name || "Sem responsável"}</span>
              </div>
              <div className="panel-row-cell">
                <strong>{lead.nextFollowUp ? formatDateTime(lead.nextFollowUp.dueAt) : "Sem próxima ação"}</strong>
                {lead.nextFollowUp && <span>{followUpTypeLabels[lead.nextFollowUp.type]}</span>}
              </div>
              <div className="panel-row-status">
                <StatusPill status={lead.status} kind="lead" />
              </div>
              <div className="panel-row-actions">
                {nextStatuses[lead.status].map((next) => (
                  <button
                    key={next}
                    className="panel-btn"
                    type="button"
                    onClick={() => mutate(() => api.updateLeadStatus(lead.id, next), "Etapa atualizada.", lead.id)}
                  >
                    {leadStatusLabels[next]}
                  </button>
                ))}
                <button className="panel-btn-primary" type="button" onClick={() => openLead(lead.id)}>Ficha</button>
                <button className="panel-btn" type="button" onClick={() => onNavigate("clientes", { clientId: lead.clientId })}>
                  Cliente
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && pagination.total > 0 && (
        <div className="panel-pagination">
          <button
            className="panel-btn"
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
          >
            Anterior
          </button>
          <span>Página {pagination.page} de {pagination.pages} · {pagination.total} lead(s)</span>
          <button
            className="panel-btn"
            type="button"
            disabled={pagination.page >= pagination.pages}
            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
          >
            Próxima
          </button>
        </div>
      )}

      {detailState === "loading" && <PanelLoading rows={3} label="Carregando ficha do lead…" />}

      {selected && detailState === "ready" && (
        <div className="panel-detail">
          <div className="panel-detail-head">
            <div>
              <h3>{selected.client.name}</h3>
              <p>{selected.client.phone}{selected.client.email ? ` · ${selected.client.email}` : ""}</p>
            </div>
            <div className="panel-row-actions">
              <button className="panel-btn" type="button" onClick={() => onNavigate("clientes", { clientId: selected.clientId })}>
                Abrir cliente
              </button>
              <button className="panel-btn" type="button" onClick={() => { setSelected(null); setDetailState("idle"); }}>
                Fechar
              </button>
            </div>
          </div>

          <div className="panel-detail-facts">
            <div><span>Origem</span><strong>{leadSourceLabels[selected.source]}</strong></div>
            <div><span>Etapa</span><strong>{leadStatusLabels[selected.status]}</strong></div>
            <div>
              <span>Prioridade</span>
              <select
                value={selected.priority}
                onChange={(event) => mutate(() => api.updateLeadPriority(selected.id, event.target.value), "Prioridade atualizada.")}
              >
                {Object.entries(leadPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <span>Responsável</span>
              <select
                value={selected.ownerUserId || ""}
                onChange={(event) => mutate(
                  () => api.assignLeadOwner(selected.id, toId(event.target.value)),
                  "Responsável atualizado."
                )}
              >
                <option value="">Sem responsável</option>
                {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </div>
            <div>
              <span>Próxima ação</span>
              <strong>{selected.nextFollowUp ? formatDateTime(selected.nextFollowUp.dueAt) : "Não definida"}</strong>
            </div>
            {selected.lostReason && (
              <div><span>Motivo da perda</span><strong>{lostReasonLabels[selected.lostReason] || selected.lostReason}</strong></div>
            )}
          </div>

          <div className="panel-detail-grid">
            <section className="panel-detail-section">
              <h4>Qualificação comercial</h4>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  mutate(() => api.updateLeadQualification(selected.id, {
                    ...qualification,
                    preferredProfessionalId: toId(qualification.preferredProfessionalId)
                  }), "Qualificação salva.");
                }}
              >
                <label className="panel-field">
                  <span>
                    <input
                      type="checkbox"
                      checked={qualification.firstVisit || false}
                      onChange={(event) => setQualification({ ...qualification, firstVisit: event.target.checked })}
                    /> Primeira visita
                  </span>
                </label>
                {tenantId === "lumiere" ? (
                  <>
                    <label className="panel-field">
                      Procedimento de interesse
                      <input
                        value={qualification.procedureInterest || ""}
                        maxLength={120}
                        onChange={(event) => setQualification({ ...qualification, procedureInterest: event.target.value })}
                        required
                      />
                    </label>
                    <label className="panel-field">
                      Objetivo declarado
                      <input
                        value={qualification.statedGoal || ""}
                        maxLength={500}
                        onChange={(event) => setQualification({ ...qualification, statedGoal: event.target.value })}
                        placeholder="Sem dado clínico"
                        required
                      />
                    </label>
                    <label className="panel-field">
                      <span>
                        <input
                          type="checkbox"
                          checked={qualification.requestsEvaluation || false}
                          onChange={(event) => setQualification({ ...qualification, requestsEvaluation: event.target.checked })}
                        /> Solicita avaliação
                      </span>
                    </label>
                    <label className="panel-field">
                      <span>
                        <input
                          type="checkbox"
                          checked={qualification.packageInterest || false}
                          onChange={(event) => setQualification({ ...qualification, packageInterest: event.target.checked })}
                        /> Interesse em pacote
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="panel-field">
                      Serviço desejado
                      <input
                        value={qualification.serviceInterest || ""}
                        maxLength={120}
                        onChange={(event) => setQualification({ ...qualification, serviceInterest: event.target.value })}
                        required
                      />
                    </label>
                    <label className="panel-field">
                      Urgência
                      <select
                        value={qualification.urgency || "FLEXIBLE"}
                        onChange={(event) => setQualification({ ...qualification, urgency: event.target.value })}
                      >
                        <option value="TODAY">Hoje</option>
                        <option value="THIS_WEEK">Nesta semana</option>
                        <option value="FLEXIBLE">Flexível</option>
                      </select>
                    </label>
                    <label className="panel-field">
                      <span>
                        <input
                          type="checkbox"
                          checked={qualification.acceptsAnyProfessional || false}
                          onChange={(event) => setQualification({ ...qualification, acceptsAnyProfessional: event.target.checked })}
                        /> Aceita qualquer profissional
                      </span>
                    </label>
                    <label className="panel-field">
                      <span>
                        <input
                          type="checkbox"
                          checked={qualification.wantsImmediateOpening || false}
                          onChange={(event) => setQualification({ ...qualification, wantsImmediateOpening: event.target.checked })}
                        /> Interesse em encaixe
                      </span>
                    </label>
                  </>
                )}
                <label className="panel-field">
                  Profissional preferido
                  <select
                    value={qualification.preferredProfessionalId || ""}
                    onChange={(event) => setQualification({ ...qualification, preferredProfessionalId: event.target.value })}
                  >
                    <option value="">Sem preferência</option>
                    {professionals.map((professional) => (
                      <option key={professional.id} value={professional.id}>{professional.name}</option>
                    ))}
                  </select>
                </label>
                <label className="panel-field">
                  Disponibilidade
                  <input
                    value={qualification.availability || ""}
                    maxLength={500}
                    onChange={(event) => setQualification({ ...qualification, availability: event.target.value })}
                    required
                  />
                </label>
                <label className="panel-field">
                  Melhor período de contato
                  <select
                    value={qualification.bestContactPeriod || "ANY"}
                    onChange={(event) => setQualification({ ...qualification, bestContactPeriod: event.target.value })}
                  >
                    <option value="ANY">Qualquer período</option>
                    <option value="MORNING">Manhã</option>
                    <option value="AFTERNOON">Tarde</option>
                    <option value="EVENING">Noite</option>
                  </select>
                </label>
                <label className="panel-field">
                  Observação comercial
                  <input
                    value={qualification.commercialNote || ""}
                    maxLength={300}
                    onChange={(event) => setQualification({ ...qualification, commercialNote: event.target.value })}
                    required
                  />
                </label>
                <button className="panel-btn-primary" type="submit">Salvar qualificação</button>
              </form>
            </section>

            <section className="panel-detail-section">
              <h4>Próximas ações</h4>
              <div className="panel-item-list">
                {selected.followUps.length === 0 && <p>Nenhuma próxima ação registrada.</p>}
                {selected.followUps.map((followUp) => (
                  <div className="panel-item" key={followUp.id}>
                    <strong>{followUpTypeLabels[followUp.type] || followUp.type}</strong>
                    <span>{formatDateTime(followUp.dueAt)} · {followUp.owner?.name || "Sem responsável"}</span>
                    {followUp.note && <p>{followUp.note}</p>}
                    <div className="panel-tags"><StatusPill status={followUp.status} kind="followUp" /></div>
                    {followUp.status === "OPEN" && (
                      <div className="panel-row-actions" style={{ justifyContent: "flex-start", marginTop: 6 }}>
                        <button
                          className="panel-btn"
                          type="button"
                          onClick={() => mutate(() => api.completeFollowUp(followUp.id), "Follow-up concluído.")}
                        >
                          Concluir
                        </button>
                        <button
                          className="panel-btn"
                          type="button"
                          onClick={() => mutate(() => api.completeFollowUp(followUp.id, {
                            dueAt: new Date(followUpForm.dueAt).toISOString(),
                            type: followUpForm.type,
                            ownerUserId: toId(followUpForm.ownerUserId),
                            note: followUpForm.note
                          }), "Follow-up concluído e próxima ação criada.")}
                        >
                          Concluir e criar próximo
                        </button>
                        <button
                          className="panel-btn"
                          type="button"
                          onClick={() => mutate(() => api.cancelFollowUp(followUp.id), "Follow-up cancelado.")}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {activeLeadStatuses.includes(selected.status) && (
                <form
                  className="panel-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutate(() => api.createFollowUp({
                      clientId: selected.clientId,
                      leadId: selected.id,
                      dueAt: new Date(followUpForm.dueAt).toISOString(),
                      type: followUpForm.type,
                      ownerUserId: toId(followUpForm.ownerUserId),
                      note: followUpForm.note
                    }), "Próxima ação criada.");
                  }}
                >
                  <label className="panel-field">
                    Data
                    <input
                      type="datetime-local"
                      value={followUpForm.dueAt}
                      onChange={(event) => setFollowUpForm({ ...followUpForm, dueAt: event.target.value })}
                      required
                    />
                  </label>
                  <label className="panel-field">
                    Tipo
                    <select value={followUpForm.type} onChange={(event) => setFollowUpForm({ ...followUpForm, type: event.target.value })}>
                      {Object.entries(followUpTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="panel-field">
                    Responsável
                    <select
                      value={followUpForm.ownerUserId}
                      onChange={(event) => setFollowUpForm({ ...followUpForm, ownerUserId: event.target.value })}
                    >
                      <option value="">Sem responsável</option>
                      {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  </label>
                  <label className="panel-field" style={{ flex: "1 1 180px" }}>
                    Orientação
                    <input
                      value={followUpForm.note}
                      maxLength={500}
                      onChange={(event) => setFollowUpForm({ ...followUpForm, note: event.target.value })}
                    />
                  </label>
                  <button className="panel-btn-primary" type="submit">Criar próxima ação</button>
                </form>
              )}
            </section>

            <section className="panel-detail-section">
              <h4>Agendamentos e conversão</h4>
              <div className="panel-item-list">
                {selected.sourceAppointments.length === 0 && <p>Nenhum agendamento vinculado.</p>}
                {selected.sourceAppointments.map((appointment) => (
                  <div className="panel-item" key={appointment.id}>
                    <strong>{appointment.service.name}</strong>
                    <span>{appointment.date.slice(0, 10)} · {appointment.time}</span>
                    <div className="panel-tags"><StatusPill status={appointment.status} /></div>
                  </div>
                ))}
              </div>

              {activeLeadStatuses.includes(selected.status) && (
                <>
                  <div className="panel-inline-form">
                    <label className="panel-field" style={{ flex: "1 1 200px" }}>
                      Converter por agendamento existente
                      <select value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}>
                        <option value="">Selecione um agendamento</option>
                        {clientAppointments.map((appointment) => (
                          <option key={appointment.id} value={appointment.id}>
                            {appointment.date.slice(0, 10)} · {appointment.time} · {appointment.service.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="panel-btn"
                      type="button"
                      onClick={() => {
                        if (!appointmentId) {
                          setMessage({ type: "error", text: "Selecione um agendamento válido." });
                          return;
                        }
                        mutate(() => api.convertLead(selected.id, toId(appointmentId)), "Lead convertido.");
                      }}
                    >
                      Converter
                    </button>
                  </div>

                  <form
                    className="panel-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      mutate(() => api.convertLead(selected.id, {
                        appointment: {
                          ...appointmentForm,
                          serviceId: toId(appointmentForm.serviceId),
                          professionalId: toId(appointmentForm.professionalId)
                        }
                      }), "Agendamento criado e lead convertido.");
                    }}
                  >
                    <label className="panel-field">
                      Serviço
                      <select
                        value={appointmentForm.serviceId}
                        onChange={(event) => setAppointmentForm({ ...appointmentForm, serviceId: event.target.value })}
                        required
                      >
                        <option value="">Serviço</option>
                        {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                      </select>
                    </label>
                    <label className="panel-field">
                      Profissional
                      <select
                        value={appointmentForm.professionalId}
                        onChange={(event) => setAppointmentForm({ ...appointmentForm, professionalId: event.target.value })}
                        required
                      >
                        <option value="">Profissional</option>
                        {professionals.map((professional) => (
                          <option key={professional.id} value={professional.id}>{professional.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="panel-field">
                      Data
                      <input
                        type="date"
                        value={appointmentForm.date}
                        onChange={(event) => setAppointmentForm({ ...appointmentForm, date: event.target.value })}
                        required
                      />
                    </label>
                    <label className="panel-field">
                      Horário
                      <input
                        type="time"
                        value={appointmentForm.time}
                        onChange={(event) => setAppointmentForm({ ...appointmentForm, time: event.target.value })}
                        required
                      />
                    </label>
                    <button className="panel-btn-primary" type="submit">Criar e converter</button>
                  </form>
                </>
              )}
            </section>

            <section className="panel-detail-section">
              <h4>Notas e histórico comercial</h4>
              <form
                className="panel-inline-form"
                style={{ marginTop: 0, borderTop: "none", paddingTop: 0 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  mutate(async () => {
                    await api.addLeadNote(selected.id, note);
                    setNote("");
                  }, "Nota adicionada ao histórico.");
                }}
              >
                <label className="panel-field" style={{ flex: "1 1 200px" }}>
                  Nova nota
                  <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} required />
                </label>
                <button className="panel-btn-primary" type="submit">Adicionar</button>
              </form>
              <ol className="panel-history">
                {[...selected.relationshipHistory].reverse().map((event) => (
                  <li key={event.id}>
                    <strong>{relationshipHistoryLabels[event.type] || event.type}</strong>
                    {event.metadata?.content && <p>{event.metadata.content}</p>}
                    <span>
                      {formatDateTime(event.createdAt)}
                      {event.actor?.name ? ` · ${event.actor.name}` : event.actorType === "SYSTEM" ? " · Sistema" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {activeLeadStatuses.includes(selected.status) && (
            <form
              className="panel-inline-form"
              style={{ padding: 14 }}
              onSubmit={(event) => {
                event.preventDefault();
                mutate(() => api.loseLead(selected.id, loss.lostReason, loss.lostReasonNote), "Lead marcado como perdido.");
              }}
            >
              <label className="panel-field">
                Marcar como perdido
                <select value={loss.lostReason} onChange={(event) => setLoss({ ...loss, lostReason: event.target.value })}>
                  {Object.entries(lostReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {loss.lostReason === "OTHER" && (
                <label className="panel-field" style={{ flex: "1 1 200px" }}>
                  Explique o motivo
                  <input
                    value={loss.lostReasonNote}
                    maxLength={300}
                    onChange={(event) => setLoss({ ...loss, lostReasonNote: event.target.value })}
                    required
                  />
                </label>
              )}
              <button className="panel-btn" type="submit">Confirmar perda</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
