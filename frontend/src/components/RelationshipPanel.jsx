import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import StateMessage from "./StateMessage.jsx";

const nextStatuses = {
  NEW: ["CONTACTED", "QUALIFIED"],
  CONTACTED: ["QUALIFIED"],
  QUALIFIED: [],
  CONVERTED: [],
  LOST: []
};

function dateTimeInputValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function RelationshipPanel({ appointments }) {
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientHistory, setClientHistory] = useState([]);
  const [note, setNote] = useState("");
  const [appointmentByLead, setAppointmentByLead] = useState({});
  const [followUpForm, setFollowUpForm] = useState({ clientId: "", leadId: "", dueAt: dateTimeInputValue(), type: "CONTACT", note: "" });

  const openFollowUps = useMemo(() => followUps.filter((item) => item.status === "OPEN"), [followUps]);

  async function load(preserveMessage = false) {
    setState("loading");
    if (!preserveMessage) setMessage("");
    try {
      const [clientData, leadData, followUpData] = await Promise.all([
        api.getClients(),
        api.getLeads(),
        api.getFollowUps()
      ]);
      setClients(clientData);
      setLeads(leadData);
      setFollowUps(followUpData);
      setFollowUpForm((current) => ({ ...current, clientId: current.clientId || String(clientData[0]?.id || "") }));
      setState("ready");
    } catch (error) {
      setMessage(error.message);
      setState("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function showClient(id) {
    setMessage("");
    try {
      const [detail, history] = await Promise.all([api.getClient(id), api.getClientHistory(id)]);
      setSelectedClient(detail);
      setClientHistory(history);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function addNote(event) {
    event.preventDefault();
    try {
      await api.addClientNote(selectedClient.id, note);
      setNote("");
      setMessage("Nota adicionada com sucesso.");
      await showClient(selectedClient.id);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function changeLeadStatus(id, status) {
    try {
      await api.updateLeadStatus(id, status);
      setMessage("Status do lead atualizado.");
      await load(true);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loseLead(id) {
    const reason = window.prompt("Motivo da perda:");
    if (!reason) return;
    try {
      await api.loseLead(id, reason);
      setMessage("Lead marcado como perdido.");
      await load(true);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function convertLead(lead) {
    const appointmentId = Number(appointmentByLead[lead.id]);
    if (!appointmentId) {
      setMessage("Selecione um agendamento do mesmo cliente.");
      return;
    }
    try {
      await api.convertLead(lead.id, appointmentId);
      setMessage("Lead convertido e vinculado ao agendamento.");
      await load(true);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function createFollowUp(event) {
    event.preventDefault();
    try {
      await api.createFollowUp({
        ...followUpForm,
        clientId: Number(followUpForm.clientId),
        leadId: followUpForm.leadId ? Number(followUpForm.leadId) : null,
        dueAt: new Date(followUpForm.dueAt).toISOString()
      });
      setFollowUpForm({ clientId: followUpForm.clientId, leadId: "", dueAt: dateTimeInputValue(), type: "CONTACT", note: "" });
      setMessage("Follow-up criado com sucesso.");
      await load(true);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function completeFollowUp(id) {
    try {
      await api.completeFollowUp(id);
      setMessage("Follow-up concluído.");
      await load(true);
    } catch (error) {
      setMessage(error.message);
    }
  }

  if (state === "loading") {
    return <section className="panel relationship-panel"><StateMessage type="loading" title="Carregando clientes e leads…" /></section>;
  }
  if (state === "error") {
    return <section className="panel relationship-panel"><StateMessage type="error" title="Relacionamento indisponível" onRetry={load}>{message}</StateMessage></section>;
  }

  return (
    <section className="panel relationship-panel">
      <div className="relationship-panel-header">
        <div>
          <span className="eyebrow">Relacionamento</span>
          <h2>Clientes, leads e próximos contatos</h2>
        </div>
        <button className="admin-action-secondary" type="button" onClick={() => load()}>Atualizar</button>
      </div>
      {message && <StateMessage type={message.includes("sucesso") || message.includes("atualizado") || message.includes("concluído") || message.includes("convertido") ? "success" : "error"} title="Operação">{message}</StateMessage>}
      <div className="relationship-admin-grid">
        <div>
          <h3>Clientes ({clients.length})</h3>
          {clients.length === 0 && <StateMessage title="Nenhum cliente cadastrado" />}
          <div className="relationship-list">
            {clients.map((client) => (
              <button type="button" key={client.id} onClick={() => showClient(client.id)}>
                <strong>{client.name}</strong>
                <span>{client.phone} · {client._count.appointments} agendamento(s)</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>Leads ({leads.length})</h3>
          {leads.length === 0 && <StateMessage title="Nenhum lead cadastrado" />}
          <div className="relationship-list">
            {leads.map((lead) => {
              const compatibleAppointments = appointments.filter((appointment) => appointment.clientId === lead.clientId);
              return (
                <article key={lead.id} className="relationship-card">
                  <strong>{lead.client.name}</strong>
                  <span>{lead.source} · {lead.status}</span>
                  {lead.interestSummary && <p>{lead.interestSummary}</p>}
                  <div className="relationship-actions">
                    {nextStatuses[lead.status].map((status) => (
                      <button type="button" key={status} onClick={() => changeLeadStatus(lead.id, status)}>{status}</button>
                    ))}
                    {!["CONVERTED", "LOST"].includes(lead.status) && <button type="button" onClick={() => loseLead(lead.id)}>Perdido</button>}
                  </div>
                  {!["CONVERTED", "LOST"].includes(lead.status) && compatibleAppointments.length > 0 && (
                    <div className="relationship-convert">
                      <select value={appointmentByLead[lead.id] || ""} onChange={(event) => setAppointmentByLead({ ...appointmentByLead, [lead.id]: event.target.value })}>
                        <option value="">Agendamento para conversão</option>
                        {compatibleAppointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.date.slice(0, 10)} · {appointment.time}</option>)}
                      </select>
                      <button type="button" onClick={() => convertLead(lead)}>Converter</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
        <div>
          <h3>Follow-ups abertos ({openFollowUps.length})</h3>
          {openFollowUps.length === 0 && <StateMessage title="Nenhum follow-up aberto" />}
          <div className="relationship-list">
            {openFollowUps.map((followUp) => (
              <article key={followUp.id} className="relationship-card">
                <strong>{followUp.client.name}</strong>
                <span>{new Date(followUp.dueAt).toLocaleString("pt-BR")} · {followUp.type}</span>
                {followUp.overdue && <b className="relationship-overdue">Vencido</b>}
                {followUp.note && <p>{followUp.note}</p>}
                <button type="button" onClick={() => completeFollowUp(followUp.id)}>Concluir</button>
              </article>
            ))}
          </div>
          <form className="relationship-followup-form" onSubmit={createFollowUp}>
            <h4>Novo follow-up</h4>
            <select value={followUpForm.clientId} onChange={(event) => setFollowUpForm({ ...followUpForm, clientId: event.target.value, leadId: "" })} required>
              <option value="">Cliente</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <select value={followUpForm.leadId} onChange={(event) => setFollowUpForm({ ...followUpForm, leadId: event.target.value })}>
              <option value="">Sem lead específico</option>
              {leads.filter((lead) => String(lead.clientId) === followUpForm.clientId).map((lead) => <option key={lead.id} value={lead.id}>{lead.source} · {lead.status}</option>)}
            </select>
            <input type="datetime-local" value={followUpForm.dueAt} onChange={(event) => setFollowUpForm({ ...followUpForm, dueAt: event.target.value })} required />
            <select value={followUpForm.type} onChange={(event) => setFollowUpForm({ ...followUpForm, type: event.target.value })}>
              <option value="CONTACT">Contato</option><option value="RETURN">Retorno</option><option value="EVALUATION">Avaliação</option><option value="WAITLIST">Lista de espera</option><option value="OTHER">Outro</option>
            </select>
            <input value={followUpForm.note} onChange={(event) => setFollowUpForm({ ...followUpForm, note: event.target.value })} maxLength={500} placeholder="Nota opcional" />
            <button className="admin-action-primary" type="submit">Criar follow-up</button>
          </form>
        </div>
      </div>
      {selectedClient && (
        <div className="relationship-client-detail">
          <div>
            <h3>{selectedClient.name}</h3>
            <span>{selectedClient.phone}{selectedClient.email ? ` · ${selectedClient.email}` : ""}</span>
            {selectedClient.notes && <p className="relationship-internal-note"><strong>Notas internas:</strong> {selectedClient.notes}</p>}
            <form onSubmit={addNote} className="relationship-note-form">
              <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Adicionar nota interna" required />
              <button type="submit">Adicionar nota</button>
            </form>
          </div>
          <div>
            <h3>Histórico comercial</h3>
            {clientHistory.length === 0 && <StateMessage title="Histórico vazio" />}
            <ol className="relationship-history">
              {clientHistory.map((event) => <li key={event.id}><strong>{event.type}</strong><span>{new Date(event.createdAt).toLocaleString("pt-BR")}</span></li>)}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
