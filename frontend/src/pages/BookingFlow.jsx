import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import StateMessage from "../components/StateMessage.jsx";
import { formatCurrency, todayInputValue } from "../utils/format.js";

const initialForm = {
  clientName: "",
  clientPhone: "",
  clientEmail: ""
};

export default function BookingFlow({ services, professionals, initialServiceId, onSuccess }) {
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
        if (!ignore) {
          setSlots(data);
        }
      })
      .catch((error) => {
        if (!ignore) {
          setSlotsError(error.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setSlotsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [date, selectedProfessionalId, selectedServiceId]);

  function handleSubmit(event) {
    event.preventDefault();

    if (!selectedServiceId || !selectedProfessionalId || !date || !time) {
      setSlotsError("Complete serviço, profissional, data e horário antes de confirmar.");
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
        <span>Agendamento online</span>
        <h2>Reserve seu horário</h2>
      </div>

      <div className="steps">
        {[1, 2, 3].map((item) => (
          <span key={item} className={step === item ? "current" : ""}>{item}</span>
        ))}
      </div>

      {step === 1 && (
        <div className="panel">
          <h3>1. Escolha o serviço</h3>
          {!services.length && <StateMessage title="Nenhum serviço disponível" />}
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
          <button type="button" className="primary-button" disabled={!selectedServiceId} onClick={() => setStep(2)}>
            Continuar
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="panel">
          <h3>2. Escolha profissional, data e horário</h3>
          <label>
            Profissional
            <select value={selectedProfessionalId} onChange={(event) => setSelectedProfessionalId(event.target.value)}>
              <option value="">Selecione</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>{professional.name}</option>
              ))}
            </select>
          </label>
          <label>
            Data
            <input type="date" min={todayInputValue()} value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          {slotsLoading && <StateMessage type="loading" title="Buscando horários" />}
          {slotsError && <StateMessage type="error" title="Não foi possível buscar horários">{slotsError}</StateMessage>}
          {!slotsLoading && selectedProfessionalId && slots.length === 0 && !slotsError && (
            <StateMessage title="Nenhum horário disponível">Tente outra data ou outro profissional.</StateMessage>
          )}
          <div className="slot-grid">
            {slots.map((slot) => (
              <button key={slot} type="button" className={time === slot ? "slot selected" : "slot"} onClick={() => setTime(slot)}>
                {slot}
              </button>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="secondary-button" onClick={() => setStep(1)}>Voltar</button>
            <button type="button" className="primary-button" disabled={!selectedProfessionalId || !time} onClick={() => setStep(3)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form className="panel" onSubmit={handleSubmit}>
          <h3>3. Dados e confirmação</h3>
          <div className="summary-box">
            <strong>{selectedService?.name}</strong>
            <span>{selectedProfessional?.name}</span>
            <span>{date} às {time}</span>
          </div>
          <label>
            Nome
            <input value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} required />
          </label>
          <label>
            Telefone
            <input value={form.clientPhone} onChange={(event) => setForm({ ...form, clientPhone: event.target.value })} required />
          </label>
          <label>
            E-mail
            <input type="email" value={form.clientEmail} onChange={(event) => setForm({ ...form, clientEmail: event.target.value })} />
          </label>
          {slotsError && <StateMessage type="error" title="Erro ao confirmar">{slotsError}</StateMessage>}
          <div className="actions">
            <button type="button" className="secondary-button" onClick={() => setStep(2)}>Voltar</button>
            <button className="primary-button" disabled={submitting || !form.clientName || !form.clientPhone}>
              {submitting ? "Confirmando..." : "Confirmar agendamento"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
