import React, { useState } from "react";
import { formatDate } from "../utils/format.js";
import { useTranslation } from "../i18n/I18nContext.jsx";
import { professionalDisplayName } from "../utils/presentation.js";

export default function Success({ appointment, onBack }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copyManagementLink() {
    const url = new URL(appointment.managementPath, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
  }

  function openManagement() {
    window.history.replaceState({}, "", appointment.managementPath);
    window.location.reload();
  }

  return (
    <main className="success-page">
      <section className="success-panel">
        <div className="success-icon" aria-hidden="true">✓</div>
        <span className="eyebrow">{t.success_eyebrow}</span>
        <h1>{t.success_title}</h1>
        <p>{t.success_desc}</p>
        <div className="summary-box">
          <strong>{appointment.service.name}</strong>
          <span>{professionalDisplayName(appointment.professional)}</span>
          <span>{formatDate(appointment.date)} {t.at} {appointment.time}</span>
          <span>{appointment.clientName}</span>
        </div>
        <div className="success-management">
          <strong>Guarde seu link de gestão</strong>
          <p>Ele permite visualizar, confirmar, cancelar ou reagendar sem criar uma conta.</p>
          <button className="primary-button" type="button" onClick={openManagement}>Abrir meu agendamento</button>
          <button className="secondary-button" type="button" onClick={copyManagementLink}>
            {copied ? "Link copiado" : "Copiar link"}
          </button>
        </div>
        <button className="primary-button" onClick={onBack}>
          {t.success_back}
        </button>
      </section>
    </main>
  );
}
