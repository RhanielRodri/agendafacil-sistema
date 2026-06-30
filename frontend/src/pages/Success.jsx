import React from "react";
import { formatDate } from "../utils/format.js";
import { useTranslation } from "../i18n/I18nContext.jsx";

export default function Success({ appointment, onBack }) {
  const { t } = useTranslation();

  return (
    <main className="success-page">
      <section className="success-panel">
        <div className="success-icon" aria-hidden="true">✓</div>
        <span className="eyebrow">{t.success_eyebrow}</span>
        <h1>{t.success_title}</h1>
        <p>{t.success_desc}</p>
        <div className="summary-box">
          <strong>{appointment.service.name}</strong>
          <span>{appointment.professional.name}</span>
          <span>{formatDate(appointment.date)} {t.at} {appointment.time}</span>
          <span>{appointment.clientName}</span>
        </div>
        <button className="primary-button" onClick={onBack}>
          {t.success_back}
        </button>
      </section>
    </main>
  );
}
