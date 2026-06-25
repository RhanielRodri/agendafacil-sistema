import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import StateMessage from "../components/StateMessage.jsx";
import { formatCurrency, todayInputValue } from "../utils/format.js";
import { useTranslation } from "../i18n/I18nContext.jsx";

const initialForm = {
  clientName: "",
  clientPhone: "",
  clientEmail: ""
};

export default function BookingFlow({ services, professionals, initialServiceId, onSuccess }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const selectedService = useMemo(
    () => services.find((service) => service.id === Number(selectedServiceId)),
    [services, selectedServiceId]
  );

  const selectedProfessional = useMemo(
    () => professionals.find((professional) => professional.id === Number(selectedProfessionalId)),
    [professionals, selectedProfessionalId]
  );

  useEffect(() => {
    if (initialServiceId) {
      setStep(1);
      setSelectedServiceId(String(initialServiceId));
      setSelectedProfessionalId("");
      setTime("");
      setSlots([]);
      setSlotsError("");
    }
  }, [initialServiceId]);

  useEffect(() => {
    if (!selectedServiceId || !selectedProfessionalId || !date) {
      setSlots([]);
      return;
    }

    let ignore = false;
    setSlotsLoading(true);
    setSlotsError("");
    setTime("");

    api.getAvailableSlots({ date, professionalId: selectedProfessionalId, serviceId: selectedServiceId })
      .then((data) => {
        if (!ignore) setSlots(data);
      })
      .catch((error) => {
        if (!ignore) setSlotsError(error.message);
      })
      .finally(() => {
        if (!ignore) setSlotsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [date, selectedProfessionalId, selectedServiceId]);

  function handleSubmit(event) {
    event.preventDefault();

    if (!selectedServiceId || !selectedProfessionalId || !date || !time) {
      setSlotsError(t.form_incomplete);
      return;
    }

    setSlotsError("");
    setSubmitting(true);

    api.createAppointment({
      serviceId: Number(selectedServiceId),
      professionalId: Number(selectedProfessionalId),
      date,
      time,
      ...form
    })
      .then((appointment) => {
        setStep(1);
        setSelectedServiceId("");
        setSelectedProfessionalId("");
        setDate(todayInputValue());
        setTime("");
        setSlots([]);
        setForm(initialForm);
        onSuccess(appointment);
      })
      .catch((error) => {
        setSlotsError(error.message);
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <section className="section booking" id="agendamento">
      <div className="section-heading">
        <span className="eyebrow">{t.booking_eyebrow}</span>
        <h2>{t.booking_title}</h2>
      </div>

      <div className="steps" role="list" aria-label="Etapas do agendamento">
        {[1, 2, 3].map((item, index) => (
          <React.Fragment key={item}>
            {index > 0 && (
              <div className={`step-line${step > item ? " done" : ""}`} aria-hidden="true" />
            )}
            <div className="step-item" role="listitem">
              <div
                className={`step-circle${step > item ? " done" : step === item ? " current" : ""}`}
                aria-current={step === item ? "step" : undefined}
              >
                {step > item ? "✓" : item}
              </div>
              <span className={`step-label${step === item ? " current" : ""}`}>
                {t.step_labels[index]}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="booking-layout">
        <div>
          {step === 1 && (
            <div className="panel">
              <h3>{t.step1_title}</h3>
              {!services.length && <StateMessage title={t.step1_empty} />}
              <div className="choice-list">
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className={selectedServiceId === String(service.id) ? "choice selected" : "choice"}
                    onClick={() => setSelectedServiceId(String(service.id))}
                  >
                    <strong>{service.name}</strong>
                    <span>{service.description}</span>
                    <small>{formatCurrency(service.price)} · {service.duration} min</small>
                  </button>
                ))}
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={!selectedServiceId}
                  onClick={() => setStep(2)}
                >
                  {t.btn_continue}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="panel">
              <h3>{t.step2_title}</h3>
              <label>
                {t.step2_professional}
                <div className="select-wrapper">
                  <select
                    value={selectedProfessionalId}
                    onChange={(event) => setSelectedProfessionalId(event.target.value)}
                  >
                    <option value="">{t.step2_professional_placeholder}</option>
                    {professionals.map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                {t.step2_date}
                <input
                  type="date"
                  min={todayInputValue()}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              {slotsLoading && <StateMessage type="loading" title={t.step2_slots_loading} />}
              {slotsError && (
                <StateMessage type="error" title={t.step2_slots_error}>
                  {slotsError}
                </StateMessage>
              )}
              {!slotsLoading && selectedProfessionalId && slots.length === 0 && !slotsError && (
                <StateMessage title={t.step2_slots_empty}>
                  {t.step2_slots_hint}
                </StateMessage>
              )}
              <div className="slot-grid">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={time === slot ? "slot selected" : "slot"}
                    onClick={() => setTime(slot)}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              <div className="actions">
                <button type="button" className="secondary-button" onClick={() => setStep(1)}>
                  {t.btn_back}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!selectedProfessionalId || !time}
                  onClick={() => setStep(3)}
                >
                  {t.btn_continue}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form className="panel" onSubmit={handleSubmit}>
              <h3>{t.step3_title}</h3>
              <div className="summary-box">
                <strong>{selectedService?.name}</strong>
                <span>{selectedProfessional?.name}</span>
                <span>{date} {t.at} {time}</span>
              </div>
              <label>
                {t.form_name}
                <input
                  value={form.clientName}
                  onChange={(event) => setForm({ ...form, clientName: event.target.value })}
                  required
                />
              </label>
              <label>
                {t.form_phone}
                <input
                  value={form.clientPhone}
                  onChange={(event) => setForm({ ...form, clientPhone: event.target.value })}
                  required
                />
              </label>
              <label>
                {t.form_email}
                <input
                  type="email"
                  value={form.clientEmail}
                  onChange={(event) => setForm({ ...form, clientEmail: event.target.value })}
                />
              </label>
              {slotsError && (
                <StateMessage type="error" title={t.form_error}>{slotsError}</StateMessage>
              )}
              <div className="actions">
                <button type="button" className="secondary-button" onClick={() => setStep(2)}>
                  {t.btn_back}
                </button>
                <button
                  className="primary-button"
                  disabled={submitting || !form.clientName || !form.clientPhone}
                >
                  {submitting ? t.btn_confirming : t.btn_confirm}
                </button>
              </div>
            </form>
          )}
        </div>

        <aside className="booking-sidebar" aria-label="Resumo do agendamento">
          <div className="summary-sticky">
            <h4>{t.summary_title}</h4>
            <div className="summary-row">
              <span className="summary-label">{t.summary_service}</span>
              <span className="summary-value">
                {selectedService ? selectedService.name : "—"}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">{t.summary_professional}</span>
              <span className="summary-value">
                {selectedProfessional ? selectedProfessional.name : "—"}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">{t.summary_datetime}</span>
              <span className="summary-value">
                {date && time ? `${date} ${t.at} ${time}` : "—"}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">{t.summary_total}</span>
              <span className="summary-price">
                {selectedService ? formatCurrency(selectedService.price) : "—"}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
