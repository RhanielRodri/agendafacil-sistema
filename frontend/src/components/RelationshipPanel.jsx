import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import StateMessage from "./StateMessage.jsx";

const pipelineStatuses = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const activeStatuses = ["NEW", "CONTACTED", "QUALIFIED"];
const nextStatuses = {
  NEW: ["CONTACTED", "QUALIFIED"],
  CONTACTED: ["QUALIFIED"],
  QUALIFIED: [],
  CONVERTED: [],
  LOST: []
};
const statusLabels = {
  NEW: "Novo",
  CONTACTED: "Contatado",
  QUALIFIED: "Qualificado",
  CONVERTED: "Convertido",
  LOST: "Perdido"
};
const priorityLabels = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta" };
const sourceLabels = {
  BOOKING: "Agendamento",
  WAITLIST: "Lista de espera",
  EVALUATION: "Avaliação",
  CONTACT: "Contato",
  ABANDONED_BOOKING: "Agendamento abandonado",
  MANUAL: "Manual"
};
const lossLabels = {
  NO_RESPONSE: "Sem resposta",
  PRICE: "Preço",
  NO_AVAILABILITY: "Sem disponibilidade",
  CHANGED_MIND: "Mudou de ideia",
  NOT_A_FIT: "Não adequado",
  DUPLICATE: "Duplicado",
  OTHER: "Outro"
};

function dateTimeInputValue(hours = 24) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function dateInputValue(days = 1) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function pageItems(data) {
  return Array.isArray(data) ? data : data?.items || [];
}

function pageInfo(data, fallbackLimit = 10) {
  return data?.pagination || { page: 1, limit: fallbackLimit, total: pageItems(data).length, pages: 1 };
}

function maskPhone(phone = "") {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  return `${digits.slice(0, 2)} •••••-${digits.slice(-4)}`;
}

function initialFilters() {
  return {
    search: "",
    status: "",
    source: "",
    priority: "",
    ownerUserId: "",
    service: "",
    overdue: false,
    noNextAction: false,
    page: 1,
    limit: 10
  };
}

function initialFollowUp(lead = null) {
  return {
    clientId: lead ? String(lead.clientId) : "",
    leadId: lead ? String(lead.id) : "",
    dueAt: dateTimeInputValue(),
    type: "CONTACT",
    ownerUserId: lead?.ownerUserId ? String(lead.ownerUserId) : "",
    note: ""
  };
}

function qualificationForm(lead, tenantId) {
  const saved = lead?.qualification || {};
  if (tenantId === "studio-cut") {
    return {
      firstVisit: saved.firstVisit ?? false,
      serviceInterest: saved.serviceInterest || lead?.service?.name || "",
      preferredProfessionalId: saved.preferredProfessionalId ? String(saved.preferredProfessionalId) : "",
      availability: saved.availability || "",
      commercialNote: saved.commercialNote || "",
      acceptsAnyProfessional: saved.acceptsAnyProfessional ?? true,
      bestContactPeriod: saved.bestContactPeriod || "ANY",
      wantsImmediateOpening: saved.wantsImmediateOpening ?? false,
      urgency: saved.urgency || "FLEXIBLE"
    };
  }
  return {
    firstVisit: saved.firstVisit ?? false,
    procedureInterest: saved.procedureInterest || lead?.service?.name || "",
    preferredProfessionalId: saved.preferredProfessionalId ? String(saved.preferredProfessionalId) : "",
    availability: saved.availability || "",
    commercialNote: saved.commercialNote || "",
    bestContactPeriod: saved.bestContactPeriod || "ANY",
    requestsEvaluation: saved.requestsEvaluation ?? true,
    statedGoal: saved.statedGoal || "",
    packageInterest: saved.packageInterest ?? false
  };
}

export default function RelationshipPanel({ appointments, services, professionals }) {
  const [filters, setFilters] = useState(initialFilters);
  const [filterDraft, setFilterDraft] = useState(initialFilters);
  const [leadsData, setLeadsData] = useState({ items: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 } });
  const [clients, setClients] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [users, setUsers] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailState, setDetailState] = useState("idle");
  const [qualification, setQualification] = useState({});
  const [followUpForm, setFollowUpForm] = useState(initialFollowUp());
  const [note, setNote] = useState("");
  const [loss, setLoss] = useState({ lostReason: "NO_RESPONSE", lostReasonNote: "" });
  const [appointmentId, setAppointmentId] = useState("");
  const [appointmentForm, setAppointmentForm] = useState({
    serviceId: "",
    professionalId: "",
    date: dateInputValue(),
    time: "09:00"
  });

  const leads = pageItems(leadsData);
  const pagination = pageInfo(leadsData);
  const activeUsers = users.filter((user) => user.active);
  const hasFilters = Object.entries(filters).some(([key, value]) => !["page", "limit"].includes(key) && Boolean(value));

  const groupedLeads = useMemo(() => Object.fromEntries(
    pipelineStatuses.map((status) => [status, leads.filter((lead) => lead.status === status)])
  ), [leads]);

  async function load(preserveMessage = false) {
    setState("loading");
    if (!preserveMessage) setMessage(null);
    try {
      const [me, userData, clientData, leadData, followUpData] = await Promise.all([
        api.adminMe(),
        api.getAdminUsers(),
        api.getClients({ page: 1, limit: 50 }),
        api.getLeads(filters),
        api.getFollowUps({ page: 1, limit: 20, status: "OPEN" })
      ]);
      setTenantId(me.tenantId);
      setUsers(userData);
      setClients(pageItems(clientData));
      setLeadsData(leadData);
      setFollowUps(pageItems(followUpData));
      setState("ready");
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      setState(error.status === 401 ? "session-expired" : "error");
    }
  }

  useEffect(() => {
    load();
  }, [filters]);

  async function openLead(id, preserveMessage = false) {
    setDetailState("loading");
    if (!preserveMessage) setMessage(null);
    try {
      const lead = await api.getLead(id);
      setSelectedLead(lead);
      setQualification(qualificationForm(lead, tenantId));
      setFollowUpForm(initialFollowUp(lead));
      setAppointmentId(lead.convertedAppointmentId ? String(lead.convertedAppointmentId) : "");
      setAppointmentForm({
        serviceId: lead.serviceId ? String(lead.serviceId) : String(services[0]?.id || ""),
        professionalId: lead.professionalId ? String(lead.professionalId) : String(professionals[0]?.id || ""),
        date: dateInputValue(),
        time: "09:00"
      });
      setDetailState("ready");
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      setDetailState("error");
      if (error.status === 401) setState("session-expired");
    }
  }

  async function refreshAfter(action, success, leadId = selectedLead?.id) {
    try {
      await action();
      setMessage({ type: "success", text: success });
      await load(true);
      if (leadId) await openLead(leadId, true);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      if (error.status === 401) setState("session-expired");
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    setFilters({ ...filterDraft, page: 1, limit: filters.limit });
  }

  function clearFilters() {
    const clean = initialFilters();
    setFilterDraft(clean);
    setFilters(clean);
  }

  function updatePriority(lead, priority) {
    refreshAfter(() => api.updateLeadPriority(lead.id, priority), "Prioridade atualizada.", selectedLead?.id === lead.id ? lead.id : null);
  }

  function updateOwner(lead, value) {
    const ownerUserId = value ? Number(value) : null;
    refreshAfter(() => api.assignLeadOwner(lead.id, ownerUserId), "Responsável atualizado.", selectedLead?.id === lead.id ? lead.id : null);
  }

  function changeStatus(lead, status) {
    refreshAfter(() => api.updateLeadStatus(lead.id, status), "Etapa atualizada.", selectedLead?.id === lead.id ? lead.id : null);
  }

  function saveQualification(event) {
    event.preventDefault();
    const payload = {
      ...qualification,
      preferredProfessionalId: qualification.preferredProfessionalId ? Number(qualification.preferredProfessionalId) : null
    };
    refreshAfter(() => api.updateLeadQualification(selectedLead.id, payload), "Qualificação salva.");
  }

  function createFollowUp(event) {
    event.preventDefault();
    const payload = {
      ...followUpForm,
      clientId: Number(followUpForm.clientId),
      leadId: Number(followUpForm.leadId),
      ownerUserId: followUpForm.ownerUserId ? Number(followUpForm.ownerUserId) : null,
      dueAt: new Date(followUpForm.dueAt).toISOString()
    };
    refreshAfter(() => api.createFollowUp(payload), "Próxima ação criada.");
  }

  function completeFollowUp(followUp, createNext) {
    const nextFollowUp = createNext ? {
      dueAt: new Date(followUpForm.dueAt).toISOString(),
      type: followUpForm.type,
      ownerUserId: followUpForm.ownerUserId ? Number(followUpForm.ownerUserId) : null,
      note: followUpForm.note
    } : null;
    refreshAfter(() => api.completeFollowUp(followUp.id, nextFollowUp), createNext ? "Follow-up concluído e próxima ação criada." : "Follow-up concluído.");
  }

  function addNote(event) {
    event.preventDefault();
    refreshAfter(async () => {
      await api.addLeadNote(selectedLead.id, note);
      setNote("");
    }, "Nota adicionada ao histórico.");
  }

  function loseLead(event) {
    event.preventDefault();
    refreshAfter(() => api.loseLead(selectedLead.id, loss.lostReason, loss.lostReasonNote), "Lead marcado como perdido.");
  }

  function convertExisting() {
    if (!appointmentId) {
      setMessage({ type: "error", text: "Selecione um agendamento válido." });
      return;
    }
    refreshAfter(() => api.convertLead(selectedLead.id, Number(appointmentId)), "Lead convertido.");
  }

  function convertCreating(event) {
    event.preventDefault();
    refreshAfter(() => api.convertLead(selectedLead.id, {
      appointment: {
        ...appointmentForm,
        serviceId: Number(appointmentForm.serviceId),
        professionalId: Number(appointmentForm.professionalId)
      }
    }), "Agendamento criado e Lead convertido.");
  }

  if (state === "loading" && !leads.length) {
    return <section className="panel relationship-panel"><StateMessage type="loading" title="Carregando pipeline…" /></section>;
  }
  if (state === "session-expired") {
    return <section className="panel relationship-panel"><StateMessage type="error" title="Sessão expirada" onRetry={() => window.location.reload()}>Entre novamente para continuar.</StateMessage></section>;
  }
  if (state === "error") {
    return <section className="panel relationship-panel"><StateMessage type="error" title="Pipeline indisponível" onRetry={() => load()}>{message?.text}</StateMessage></section>;
  }

  const compatibleAppointments = selectedLead
    ? appointments.filter((appointment) => appointment.clientId === selectedLead.clientId && appointment.status !== "CANCELLED")
    : [];

  return (
    <section className="panel relationship-panel">
      <div className="relationship-panel-header">
        <div>
          <span className="eyebrow">Pipeline comercial</span>
          <h2>Leads e próximas ações</h2>
        </div>
        <button className="admin-action-secondary" type="button" onClick={() => load()}>Atualizar</button>
      </div>

      {message && <StateMessage type={message.type} title={message.type === "success" ? "Operação concluída" : "Não foi possível concluir"}>{message.text}</StateMessage>}

      <form className="relationship-filters" onSubmit={applyFilters}>
        <input value={filterDraft.search} onChange={(event) => setFilterDraft({ ...filterDraft, search: event.target.value })} placeholder="Buscar nome ou telefone" />
        <select value={filterDraft.status} onChange={(event) => setFilterDraft({ ...filterDraft, status: event.target.value })}>
          <option value="">Todas as etapas</option>
          {pipelineStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
        <select value={filterDraft.priority} onChange={(event) => setFilterDraft({ ...filterDraft, priority: event.target.value })}>
          <option value="">Todas as prioridades</option>
          {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={filterDraft.ownerUserId} onChange={(event) => setFilterDraft({ ...filterDraft, ownerUserId: event.target.value })}>
          <option value="">Todos os responsáveis</option>
          {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <select value={filterDraft.source} onChange={(event) => setFilterDraft({ ...filterDraft, source: event.target.value })}>
          <option value="">Todas as origens</option>
          {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={filterDraft.service} onChange={(event) => setFilterDraft({ ...filterDraft, service: event.target.value })}>
          <option value="">Todos os serviços</option>
          {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select>
        <label className="relationship-check"><input type="checkbox" checked={filterDraft.overdue} onChange={(event) => setFilterDraft({ ...filterDraft, overdue: event.target.checked })} /> Follow-up vencido</label>
        <label className="relationship-check"><input type="checkbox" checked={filterDraft.noNextAction} onChange={(event) => setFilterDraft({ ...filterDraft, noNextAction: event.target.checked })} /> Sem próxima ação</label>
        <div className="relationship-filter-actions">
          <button className="admin-action-primary" type="submit">Filtrar</button>
          <button className="admin-action-secondary" type="button" onClick={clearFilters}>Limpar</button>
        </div>
      </form>

      {pagination.total === 0 && (
        <StateMessage title={hasFilters ? "Sem resultados" : "Nenhum lead cadastrado"}>
          {hasFilters ? "Ajuste os filtros para ampliar a busca." : "Novos pedidos aparecerão aqui."}
        </StateMessage>
      )}

      {pagination.total > 0 && (
        <div className="relationship-pipeline">
          {pipelineStatuses.map((status) => (
            <section className="relationship-pipeline-column" key={status}>
              <header><strong>{statusLabels[status]}</strong><span>{groupedLeads[status].length}</span></header>
              <div className="relationship-pipeline-list">
                {groupedLeads[status].length === 0 && <p className="relationship-column-empty">Nenhum nesta página</p>}
                {groupedLeads[status].map((lead) => (
                  <article className={`relationship-lead-card priority-${lead.priority.toLowerCase()}`} key={lead.id}>
                    <button className="relationship-lead-open" type="button" onClick={() => openLead(lead.id)}>
                      <strong>{lead.client.name}</strong>
                      <span>{maskPhone(lead.client.phone)}</span>
                    </button>
                    <p>{lead.service?.name || lead.interestSummary || "Interesse não informado"}</p>
                    <small>{sourceLabels[lead.source]} · {new Date(lead.createdAt).toLocaleDateString("pt-BR")}</small>
                    <div className="relationship-card-fields">
                      <select aria-label="Prioridade" value={lead.priority} onChange={(event) => updatePriority(lead, event.target.value)}>
                        {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <select aria-label="Responsável" value={lead.ownerUserId || ""} onChange={(event) => updateOwner(lead, event.target.value)}>
                        <option value="">Sem responsável</option>
                        {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                      </select>
                    </div>
                    {lead.nextFollowUp ? (
                      <div className={lead.overdue ? "relationship-next-action overdue" : "relationship-next-action"}>
                        <strong>{lead.overdue ? "Vencido" : "Próxima ação"}</strong>
                        <span>{new Date(lead.nextFollowUp.dueAt).toLocaleString("pt-BR")} · {lead.nextFollowUp.type}</span>
                      </div>
                    ) : activeStatuses.includes(lead.status) ? <b className="relationship-attention">Sem próxima ação</b> : null}
                    <div className="relationship-actions">
                      {nextStatuses[lead.status].map((nextStatus) => <button type="button" key={nextStatus} onClick={() => changeStatus(lead, nextStatus)}>{statusLabels[nextStatus]}</button>)}
                      <button type="button" onClick={() => openLead(lead.id)}>Detalhes</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="relationship-pagination">
        <button type="button" disabled={pagination.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Anterior</button>
        <span>Página {pagination.page} de {pagination.pages} · {pagination.total} lead(s)</span>
        <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Próxima</button>
      </div>

      {detailState === "loading" && <div className="relationship-detail"><StateMessage type="loading" title="Carregando ficha…" /></div>}
      {selectedLead && detailState === "ready" && (
        <div className="relationship-detail">
          <div className="relationship-detail-header">
            <div>
              <span className="eyebrow">Ficha do Lead</span>
              <h3>{selectedLead.client.name}</h3>
              <p>{selectedLead.client.phone}{selectedLead.client.email ? ` · ${selectedLead.client.email}` : ""}</p>
            </div>
            <button className="admin-action-secondary" type="button" onClick={() => { setSelectedLead(null); setDetailState("idle"); }}>Fechar</button>
          </div>

          <div className="relationship-detail-summary">
            <span><strong>Origem</strong>{sourceLabels[selectedLead.source]}</span>
            <span><strong>Interesse</strong>{selectedLead.service?.name || selectedLead.interestSummary || "Não informado"}</span>
            <span><strong>Etapa</strong>{statusLabels[selectedLead.status]}</span>
            <span><strong>Prioridade</strong>{priorityLabels[selectedLead.priority]}</span>
            <span><strong>Responsável</strong>{selectedLead.owner?.name || "Sem responsável"}</span>
            <span><strong>Próxima ação</strong>{selectedLead.nextFollowUp ? new Date(selectedLead.nextFollowUp.dueAt).toLocaleString("pt-BR") : "Não definida"}</span>
          </div>

          <div className="relationship-detail-grid">
            <section>
              <h4>Qualificação comercial</h4>
              <form className="relationship-detail-form" onSubmit={saveQualification}>
                <label><input type="checkbox" checked={qualification.firstVisit || false} onChange={(event) => setQualification({ ...qualification, firstVisit: event.target.checked })} /> Primeira visita</label>
                {tenantId === "studio-cut" ? (
                  <>
                    <input value={qualification.serviceInterest || ""} onChange={(event) => setQualification({ ...qualification, serviceInterest: event.target.value })} maxLength={120} placeholder="Serviço desejado" required />
                    <select value={qualification.urgency || "FLEXIBLE"} onChange={(event) => setQualification({ ...qualification, urgency: event.target.value })}><option value="TODAY">Hoje</option><option value="THIS_WEEK">Nesta semana</option><option value="FLEXIBLE">Flexível</option></select>
                    <label><input type="checkbox" checked={qualification.acceptsAnyProfessional || false} onChange={(event) => setQualification({ ...qualification, acceptsAnyProfessional: event.target.checked })} /> Aceita qualquer barbeiro</label>
                    <label><input type="checkbox" checked={qualification.wantsImmediateOpening || false} onChange={(event) => setQualification({ ...qualification, wantsImmediateOpening: event.target.checked })} /> Interesse em encaixe</label>
                  </>
                ) : (
                  <>
                    <input value={qualification.procedureInterest || ""} onChange={(event) => setQualification({ ...qualification, procedureInterest: event.target.value })} maxLength={120} placeholder="Procedimento de interesse" required />
                    <input value={qualification.statedGoal || ""} onChange={(event) => setQualification({ ...qualification, statedGoal: event.target.value })} maxLength={500} placeholder="Objetivo declarado, sem dado clínico" required />
                    <label><input type="checkbox" checked={qualification.requestsEvaluation || false} onChange={(event) => setQualification({ ...qualification, requestsEvaluation: event.target.checked })} /> Solicita avaliação</label>
                    <label><input type="checkbox" checked={qualification.packageInterest || false} onChange={(event) => setQualification({ ...qualification, packageInterest: event.target.checked })} /> Interesse em pacote</label>
                  </>
                )}
                <select value={qualification.preferredProfessionalId || ""} onChange={(event) => setQualification({ ...qualification, preferredProfessionalId: event.target.value })}><option value="">Sem preferência</option>{professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select>
                <input value={qualification.availability || ""} onChange={(event) => setQualification({ ...qualification, availability: event.target.value })} maxLength={500} placeholder="Disponibilidade" required />
                <select value={qualification.bestContactPeriod || "ANY"} onChange={(event) => setQualification({ ...qualification, bestContactPeriod: event.target.value })}><option value="ANY">Qualquer período</option><option value="MORNING">Manhã</option><option value="AFTERNOON">Tarde</option><option value="EVENING">Noite</option></select>
                <input value={qualification.commercialNote || ""} onChange={(event) => setQualification({ ...qualification, commercialNote: event.target.value })} maxLength={300} placeholder="Observação comercial curta" required />
                <button className="admin-action-primary" type="submit">Salvar qualificação</button>
              </form>
            </section>

            <section>
              <h4>Próximas ações</h4>
              <div className="relationship-detail-list">
                {selectedLead.followUps.map((followUp) => (
                  <article key={followUp.id}>
                    <strong>{followUp.type} · {followUp.status}</strong>
                    <span>{new Date(followUp.dueAt).toLocaleString("pt-BR")} · {followUp.owner?.name || "Sem responsável"}</span>
                    {followUp.note && <p>{followUp.note}</p>}
                    {followUp.status === "OPEN" && <div className="relationship-actions"><button type="button" onClick={() => completeFollowUp(followUp, false)}>Concluir</button><button type="button" onClick={() => completeFollowUp(followUp, true)}>Concluir + próximo</button></div>}
                  </article>
                ))}
              </div>
              {activeStatuses.includes(selectedLead.status) && (
                <form className="relationship-detail-form" onSubmit={createFollowUp}>
                  <input type="datetime-local" value={followUpForm.dueAt} onChange={(event) => setFollowUpForm({ ...followUpForm, dueAt: event.target.value })} required />
                  <select value={followUpForm.type} onChange={(event) => setFollowUpForm({ ...followUpForm, type: event.target.value })}><option value="CONTACT">Contato</option><option value="RETURN">Retorno</option><option value="EVALUATION">Avaliação</option><option value="WAITLIST">Lista de espera</option><option value="OTHER">Outro</option></select>
                  <select value={followUpForm.ownerUserId} onChange={(event) => setFollowUpForm({ ...followUpForm, ownerUserId: event.target.value })}><option value="">Sem responsável</option>{activeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
                  <input value={followUpForm.note} onChange={(event) => setFollowUpForm({ ...followUpForm, note: event.target.value })} maxLength={500} placeholder="Orientação da próxima ação" />
                  <button className="admin-action-primary" type="submit">Criar próxima ação</button>
                </form>
              )}
            </section>

            <section>
              <h4>Agendamentos relacionados</h4>
              <div className="relationship-detail-list">
                {selectedLead.sourceAppointments.length === 0 && <p>Nenhum agendamento vinculado.</p>}
                {selectedLead.sourceAppointments.map((appointment) => <article key={appointment.id}><strong>{appointment.service.name}</strong><span>{appointment.date.slice(0, 10)} · {appointment.time} · {appointment.status}</span></article>)}
              </div>
              {activeStatuses.includes(selectedLead.status) && (
                <>
                  <div className="relationship-convert">
                    <select value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)}><option value="">Agendamento existente</option>{compatibleAppointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.date.slice(0, 10)} · {appointment.time} · {appointment.status}</option>)}</select>
                    <button type="button" onClick={convertExisting}>Converter</button>
                  </div>
                  <form className="relationship-detail-form" onSubmit={convertCreating}>
                    <strong>Criar agendamento e converter</strong>
                    <select value={appointmentForm.serviceId} onChange={(event) => setAppointmentForm({ ...appointmentForm, serviceId: event.target.value })} required><option value="">Serviço</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>
                    <select value={appointmentForm.professionalId} onChange={(event) => setAppointmentForm({ ...appointmentForm, professionalId: event.target.value })} required><option value="">Profissional</option>{professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select>
                    <input type="date" value={appointmentForm.date} onChange={(event) => setAppointmentForm({ ...appointmentForm, date: event.target.value })} required />
                    <input type="time" value={appointmentForm.time} onChange={(event) => setAppointmentForm({ ...appointmentForm, time: event.target.value })} required />
                    <button className="admin-action-primary" type="submit">Criar e converter</button>
                  </form>
                </>
              )}
            </section>

            <section>
              <h4>Notas e histórico comercial</h4>
              <form className="relationship-note-form" onSubmit={addNote}>
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Adicionar nota comercial" required />
                <button type="submit">Adicionar</button>
              </form>
              <ol className="relationship-history">
                {selectedLead.relationshipHistory.map((event) => <li key={event.id}><strong>{event.type}</strong>{event.metadata?.content && <p>{event.metadata.content}</p>}<span>{new Date(event.createdAt).toLocaleString("pt-BR")}{event.actor?.name ? ` · ${event.actor.name}` : event.actorType === "SYSTEM" ? " · Sistema" : ""}</span></li>)}
              </ol>
            </section>
          </div>

          {activeStatuses.includes(selectedLead.status) && (
            <form className="relationship-loss-form" onSubmit={loseLead}>
              <strong>Marcar como perdido</strong>
              <select value={loss.lostReason} onChange={(event) => setLoss({ ...loss, lostReason: event.target.value })}>{Object.entries(lossLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              {loss.lostReason === "OTHER" && <input value={loss.lostReasonNote} onChange={(event) => setLoss({ ...loss, lostReasonNote: event.target.value })} maxLength={300} placeholder="Explique o motivo" required />}
              <button type="submit">Confirmar perda</button>
            </form>
          )}
        </div>
      )}

      <div className="relationship-operational-summary">
        <span>{followUps.filter((followUp) => followUp.overdue).length} follow-up(s) vencido(s)</span>
        <span>{clients.length} cliente(s) carregado(s) para operação</span>
      </div>
    </section>
  );
}
