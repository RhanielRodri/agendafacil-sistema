import React, { useRef, useState } from "react";
import { toId } from "../utils/id.js";
import tenant from "../config/site.js";
import { api } from "../services/api.js";
import StateMessage from "./StateMessage.jsx";

const defaultActions = {
  "studio-cut": [
    { label: "Entrar na lista de espera", source: "WAITLIST" },
    { label: "Falar com a equipe", source: "CONTACT" }
  ],
  lumiere: [
    { label: "Solicitar avaliação", source: "EVALUATION" },
    { label: "Tirar uma dúvida", source: "CONTACT" }
  ]
};

function actions() {
  return tenant.contact?.actions || defaultActions[tenant.slug];
}

function initialForm(source) {
  return {
    source: source || actions()[0].source,
    name: "",
    phone: "",
    email: "",
    serviceId: "",
    urgency: tenant.slug === "studio-cut" ? "FLEXIBLE" : "",
    interestSummary: "",
    createFollowUp: true,
    consent: false,
    website: ""
  };
}

export default function LeadCapture({ services }) {
  const [form, setForm] = useState(() => initialForm());
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef(null);

  function openWith(action) {
    setForm((current) => ({ ...current, source: action.source, ...(action.urgency ? { urgency: action.urgency } : {}) }));
    setExpanded(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      formRef.current?.querySelector("input, select")?.focus();
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setState("loading");
    setMessage("");
    try {
      const response = await api.captureLead({
        ...form,
        serviceId: toId(form.serviceId),
        ...(tenant.slug === "studio-cut" ? { urgency: form.urgency } : {})
      });
      setState("success");
      setMessage(response.message);
      setForm(initialForm(form.source));
      setExpanded(false);
    } catch (error) {
      setState("error");
      setMessage(error.message);
    }
  }

  return (
    <section className="section relationship-capture" id="contato">
      <div className="section-heading">
        <span className="eyebrow">Contato</span>
        <h2>{tenant.contact?.title || "Prefere conversar antes de reservar?"}</h2>
        <p className="section-description">
          {tenant.contact?.description || "Conte qual cuidado procura e retornamos com atenção."}
        </p>
      </div>

      {state === "success" && <StateMessage type="success" title="Solicitação enviada">{message}</StateMessage>}
      {state === "error" && <StateMessage type="error" title="Não foi possível enviar">{message}</StateMessage>}

      <div className="relationship-actions">
        {actions().map((action) => (
          <button
            key={action.label}
            type="button"
            className={`relationship-chip${form.source === action.source && expanded ? " active" : ""}`}
            aria-expanded={expanded}
            aria-controls="relationship-form"
            onClick={() => openWith(action)}
          >
            {action.label}
          </button>
        ))}
      </div>

      <form
        id="relationship-form"
        ref={formRef}
        className={`relationship-capture-form${expanded ? " open" : ""}`}
        onSubmit={handleSubmit}
        hidden={!expanded}
      >
        <label>
          Nome
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required />
        </label>
        <label>
          Telefone
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} inputMode="tel" required />
        </label>
        <label>
          E-mail (opcional)
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} />
        </label>
        <label>
          {tenant.slug === "lumiere" ? "Tratamento de interesse (opcional)" : "Serviço de interesse (opcional)"}
          <select value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })}>
            <option value="">Ainda não decidi</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        {tenant.slug === "studio-cut" && form.source === "WAITLIST" && (
          <label>
            Quando precisa?
            <select value={form.urgency} onChange={(event) => setForm({ ...form, urgency: event.target.value })}>
              <option value="TODAY">Hoje</option>
              <option value="THIS_WEEK">Nesta semana</option>
              <option value="FLEXIBLE">Tenho flexibilidade</option>
            </select>
          </label>
        )}
        <label className="relationship-capture-wide">
          Como podemos ajudar?
          <textarea value={form.interestSummary} onChange={(event) => setForm({ ...form, interestSummary: event.target.value })} maxLength={500} rows={3} required />
        </label>
        <div className="relationship-honeypot" aria-hidden="true">
          <label htmlFor="relationship-website">Não preencha este campo</label>
          <input
            id="relationship-website"
            name="website"
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <label className="relationship-consent relationship-capture-wide">
          <input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} required />
          Autorizo o uso destes dados somente para retorno sobre esta solicitação.
        </label>
        <button className="primary-button relationship-capture-wide" type="submit" disabled={state === "loading"}>
          {state === "loading" ? "Enviando…" : "Enviar solicitação"}
        </button>
      </form>
    </section>
  );
}
