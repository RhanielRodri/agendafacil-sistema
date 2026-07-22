import React, { useEffect, useMemo, useState } from "react";
import { toId } from "../utils/id.js";
import StatusBadge from "../components/StatusBadge.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { api } from "../services/api.js";
import { formatDate, todayInputValue } from "../utils/format.js";

const tokenMessages = {
  TOKEN_INVALID: "Este link é inválido ou não está disponível.",
  TOKEN_EXPIRED: "Este link expirou.",
  TOKEN_REVOKED: "Este link não está mais ativo.",
  TOKEN_USED: "Este link já foi substituído ou utilizado. Use o link mais recente."
};

export default function ManageAppointment({ token, professionals, onBack }) {
  const [state, setState] = useState("loading");
  const [appointment, setAppointment] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("summary");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [professionalId, setProfessionalId] = useState("");
  const [slots, setSlots] = useState([]);
  const [slot, setSlot] = useState("");
  const [slotsState, setSlotsState] = useState("idle");

  const availableProfessionals = useMemo(
    () => Array.isArray(professionals) ? professionals : [],
    [professionals]
  );

  function load() {
    if (!token) {
      setError(tokenMessages.TOKEN_INVALID);
      setState("error");
      return;
    }
    setState("loading");
    api.getManagedAppointment(token)
      .then((data) => {
        setAppointment(data);
        setProfessionalId(String(data.professional.id));
        setState("ready");
      })
      .catch((requestError) => {
        setError(tokenMessages[requestError.code] || requestError.message);
        setState("error");
      });
  }

  useEffect(() => {
    load();
  }, [token]);

  useEffect(() => {
    if (mode !== "reschedule" || !date || !professionalId) return;
    let active = true;
    setSlotsState("loading");
    setSlots([]);
    setSlot("");
    api.getRescheduleAvailability({ token, date, professionalId: toId(professionalId) })
      .then((data) => {
        if (!active) return;
        setSlots(Array.isArray(data) ? data : []);
        setSlotsState("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setActionError(requestError.message);
        setSlotsState("error");
      });
    return () => {
      active = false;
    };
  }, [mode, date, professionalId, token]);

  async function confirmAppointment() {
    setBusy(true);
    setActionError("");
    try {
      setAppointment(await api.confirmManagedAppointment(token));
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment(event) {
    event.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      setAppointment(await api.cancelManagedAppointment(token, reason));
      setMode("summary");
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleAppointment(event) {
    event.preventDefault();
    if (!slot) {
      setActionError("Escolha um horário disponível.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const result = await api.rescheduleManagedAppointment(token, {
        date,
        time: slot,
        professionalId: toId(professionalId)
      });
      window.history.replaceState({}, "", result.managementPath);
      window.location.reload();
    } catch (requestError) {
      setActionError(requestError.message);
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <main className="manage-page">
        <section className="manage-panel" aria-live="polite">
          <p>Carregando agendamento…</p>
        </section>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="manage-page">
        <section className="manage-panel">
          <span className="eyebrow">Gestão do agendamento</span>
          <h1>Não foi possível abrir o link</h1>
          <StateMessage type="error" title="Link indisponível">{error}</StateMessage>
          <button className="secondary-button" type="button" onClick={onBack}>Voltar ao início</button>
        </section>
      </main>
    );
  }

  const canManage = ["PENDING", "CONFIRMED"].includes(appointment.status);

  return (
    <main className="manage-page">
      <section className="manage-panel">
        <span className="eyebrow">Gestão do agendamento</span>
        <div className="manage-title-row">
          <h1>Seu agendamento</h1>
          <StatusBadge status={appointment.status} />
        </div>
        <div className="summary-box manage-summary">
          <strong>{appointment.service.name}</strong>
          <span>{appointment.professional.name}</span>
          <span>{formatDate(appointment.date)} às {appointment.time}</span>
          <span>{appointment.service.duration} minutos</span>
        </div>

        {actionError && (
          <StateMessage type="error" title="Não foi possível concluir">{actionError}</StateMessage>
        )}

        {mode === "summary" && (
          <div className="manage-actions">
            {appointment.status === "PENDING" && (
              <button className="primary-button" type="button" onClick={confirmAppointment} disabled={busy}>
                {busy ? "Confirmando…" : "Confirmar agendamento"}
              </button>
            )}
            {canManage && (
              <>
                <button className="secondary-button" type="button" onClick={() => setMode("reschedule")}>
                  Reagendar
                </button>
                <button className="danger-button" type="button" onClick={() => setMode("cancel")}>
                  Cancelar
                </button>
              </>
            )}
            {!canManage && (
              <p className="manage-terminal">Este agendamento está encerrado e não permite novas alterações.</p>
            )}
          </div>
        )}

        {mode === "cancel" && (
          <form className="manage-form" onSubmit={cancelAppointment}>
            <h2>Cancelar agendamento</h2>
            <label htmlFor="cancel-reason">
              Motivo opcional
              <textarea
                id="cancel-reason"
                value={reason}
                maxLength="300"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="manage-form-actions">
              <button className="danger-button" type="submit" disabled={busy}>
                {busy ? "Cancelando…" : "Confirmar cancelamento"}
              </button>
              <button className="secondary-button" type="button" onClick={() => setMode("summary")}>Voltar</button>
            </div>
          </form>
        )}

        {mode === "reschedule" && (
          <form className="manage-form" onSubmit={rescheduleAppointment}>
            <h2>Novo horário</h2>
            <label htmlFor="reschedule-professional">
              Profissional
              <select
                id="reschedule-professional"
                value={professionalId}
                onChange={(event) => setProfessionalId(event.target.value)}
                required
              >
                {availableProfessionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>{professional.name}</option>
                ))}
              </select>
            </label>
            <label htmlFor="reschedule-date">
              Data
              <input
                id="reschedule-date"
                type="date"
                min={todayInputValue()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>
            <fieldset>
              <legend>Horário</legend>
              {slotsState === "loading" && <p>Buscando horários…</p>}
              {slotsState === "ready" && slots.length === 0 && <p>Nenhum horário disponível nesta data.</p>}
              <div className="manage-slots">
                {slots.map((time) => (
                  <button
                    className={slot === time ? "selected" : ""}
                    type="button"
                    key={time}
                    onClick={() => setSlot(time)}
                    aria-pressed={slot === time}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="manage-form-actions">
              <button className="primary-button" type="submit" disabled={busy || !slot}>
                {busy ? "Reagendando…" : "Confirmar novo horário"}
              </button>
              <button className="secondary-button" type="button" onClick={() => setMode("summary")}>Voltar</button>
            </div>
          </form>
        )}

        <button className="manage-back" type="button" onClick={onBack}>Ir para a página inicial</button>
      </section>
    </main>
  );
}
