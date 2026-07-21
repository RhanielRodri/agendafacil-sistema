import React, { useState } from "react";
import tenant from "../config/tenant.js";
import { api } from "../services/api.js";
import StateMessage from "./StateMessage.jsx";

const optionsByTenant = {
  "studio-cut": [
    { value: "WAITLIST", label: "Lista de espera ou pedido de encaixe" },
    { value: "CONTACT", label: "Falar antes de agendar" }
  ],
  lumiere: [
    { value: "EVALUATION", label: "Solicitar avaliação" },
    { value: "CONTACT", label: "Falar antes de agendar" }
  ]
};

function initialForm() {
  return {
    source: optionsByTenant[tenant.slug][0].value,
    name: "",
    phone: "",
    email: "",
    serviceId: "",
    interestSummary: "",
    createFollowUp: true,
    consent: false,
    website: ""
  };
}

export default function LeadCapture({ services }) {
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setState("loading");
    setMessage("");
    try {
      const response = await api.captureLead({
        ...form,
        serviceId: form.serviceId ? Number(form.serviceId) : null
      });
      setState("success");
      setMessage(response.message);
      setForm(initialForm());
    } catch (error) {
      setState("error");
      setMessage(error.message);
    }
  }

  return (
    <section className="section relationship-capture" id="contato">
      <div className="section-heading">
        <span className="eyebrow">Contato</span>
        <h2>{tenant.slug === "studio-cut" ? "Não encontrou o horário ideal?" : "Prefere conversar antes de reservar?"}</h2>
        <p className="section-description">
          {tenant.slug === "studio-cut"
            ? "Envie seu pedido de encaixe ou entre na lista de espera."
            : "Solicite uma avaliação ou conte qual cuidado procura."}
        </p>
      </div>
      {state === "success" && <StateMessage type="success" title="Solicitação enviada">{message}</StateMessage>}
      {state === "error" && <StateMessage type="error" title="Não foi possível enviar">{message}</StateMessage>}
      <form className="relationship-capture-form" onSubmit={handleSubmit}>
        <label>
          Tipo de contato
          <select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>
            {optionsByTenant[tenant.slug].map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Nome
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} required />
        </label>
        <label>
          Telefone
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} inputMode="tel" required />
        </label>
        <label>
          E-mail opcional
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} />
        </label>
        <label>
          Serviço ou procedimento opcional
          <select value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })}>
            <option value="">Ainda não decidi</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label className="relationship-capture-wide">
          Como podemos ajudar?
          <textarea value={form.interestSummary} onChange={(event) => setForm({ ...form, interestSummary: event.target.value })} maxLength={500} rows={3} required />
        </label>
        <label className="relationship-honeypot" aria-hidden="true">
          Site
          <input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} tabIndex={-1} autoComplete="off" />
        </label>
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
