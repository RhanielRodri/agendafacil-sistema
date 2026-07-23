import React, { useMemo, useState } from "react";
import tenant from "../../config/tenant.js";
import { api } from "../../services/api.js";
import {
  buildWaAction,
  DEFAULT_TEMPLATES,
  hasWhatsappOptOut,
  TEMPLATE_KINDS,
  TEMPLATE_LABELS,
  whatsappHistoryNote
} from "../../utils/whatsapp.js";

function tomorrowLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function ManualWhatsapp({
  phone,
  clientId,
  leadId = null,
  context = {},
  initialTemplate = "initialContact",
  onChanged
}) {
  const templates = tenant?.whatsapp?.templates || DEFAULT_TEMPLATES;
  const kinds = TEMPLATE_KINDS.filter((kind) => templates[kind]);
  const [templateKind, setTemplateKind] = useState(kinds.includes(initialTemplate) ? initialTemplate : kinds[0]);
  const [dueAt, setDueAt] = useState(tomorrowLocal);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState("");
  const [optedOut, setOptedOut] = useState(false);
  const [checked, setChecked] = useState(false);
  const action = useMemo(() => buildWaAction({ phone, kind: templateKind, context, templates }), [phone, templateKind, context, templates]);

  async function loadOptOut() {
    if (checked || !clientId) return;
    setStatus("checking");
    try {
      setOptedOut(hasWhatsappOptOut(await api.getClientHistory(clientId)));
      setChecked(true);
      setFeedback("");
    } catch (failure) {
      setFeedback(failure.message);
    } finally {
      setStatus("idle");
    }
  }

  async function addHistoryNote(note) {
    if (leadId) return api.addLeadNote(leadId, note);
    return api.addClientNote(clientId, note);
  }

  async function run(operation, success) {
    setStatus("busy");
    setFeedback("");
    try {
      await operation();
      setFeedback(success);
      onChanged?.();
    } catch (failure) {
      setFeedback(failure.message);
    } finally {
      setStatus("idle");
    }
  }

  function registerContact() {
    run(() => addHistoryNote(whatsappHistoryNote("contact", templateKind)), "Contato manual registrado no histórico.");
  }

  function registerOptOut() {
    run(async () => {
      await addHistoryNote(whatsappHistoryNote("optOut", templateKind));
      setOptedOut(true);
      setChecked(true);
    }, "Não contatar registrado no histórico.");
  }

  function scheduleFollowUp(event) {
    event.preventDefault();
    run(() => api.createFollowUp({
      clientId,
      leadId,
      dueAt: new Date(dueAt).toISOString(),
      type: "CONTACT",
      ownerUserId: null,
      note: `Contato manual por WhatsApp — ${TEMPLATE_LABELS[templateKind]}.`
    }), "Próximo follow-up registrado.");
  }

  return (
    <details className="wa-manual" onToggle={(event) => event.currentTarget.open && loadOptOut()}>
      <summary>WhatsApp manual</summary>
      <div className="wa-manual-body">
        <label className="panel-field">
          Template do Client Pack
          <select value={templateKind} onChange={(event) => setTemplateKind(event.target.value)} disabled={optedOut || status === "busy"}>
            {kinds.map((kind) => <option key={kind} value={kind}>{TEMPLATE_LABELS[kind]}</option>)}
          </select>
        </label>
        <p className="wa-manual-preview">{action?.message || "Telefone indisponível para WhatsApp."}</p>
        {optedOut ? (
          <strong className="wa-manual-optout">Não contatar registrado</strong>
        ) : (
          <div className="panel-row-actions">
            {action && <a className="panel-btn-primary" href={action.url} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}
            <button className="panel-btn" type="button" disabled={status === "busy" || !clientId} onClick={registerContact}>Registrar contato realizado</button>
            <button className="panel-btn" type="button" disabled={status === "busy" || !clientId} onClick={registerOptOut}>Registrar não contatar</button>
          </div>
        )}
        {!optedOut && (
          <form className="wa-manual-followup" onSubmit={scheduleFollowUp}>
            <label className="panel-field">
              Próximo follow-up
              <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required />
            </label>
            <button className="panel-btn" type="submit" disabled={status === "busy" || !clientId}>Agendar follow-up</button>
          </form>
        )}
        {status === "checking" && <span className="wa-manual-feedback">Verificando histórico…</span>}
        {feedback && <span className="wa-manual-feedback" role="status">{feedback}</span>}
      </div>
    </details>
  );
}
