import React, { useEffect, useMemo, useState } from "react";
import BrandMark from "../components/BrandMark.jsx";
import StateMessage from "../components/StateMessage.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import site from "../config/site.js";
import { api } from "../services/api.js";
import { formatDate, todayInputValue } from "../utils/format.js";
import { toId } from "../utils/id.js";
import { professionalDisplayName } from "../utils/presentation.js";
import { waMeUrl } from "../utils/whatsapp.js";
import { formatBrazilPhone, normalizeBrazilPhone } from "../utils/phone.js";

const tokenMessages = {
  TOKEN_INVALID: "Este link é inválido ou não está disponível.",
  TOKEN_EXPIRED: "Este link expirou.",
  TOKEN_REVOKED: "Este link não está mais ativo.",
  TOKEN_USED: "Este link já foi substituído ou utilizado. Use o link mais recente."
};

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

function fallbackCapabilities(status) {
  const allowed = ["PENDING", "CONFIRMED"].includes(status);
  const message = allowed ? null : "Este agendamento está encerrado e não permite alterações.";
  return {
    minAdvanceMinutes: 240,
    cancel: { allowed, requiresConfirmation: true, message },
    reschedule: { allowed, requiresConfirmation: true, message }
  };
}

export default function ManageAppointment({ token, professionals, onBack }) {
  const [state, setState] = useState("loading");
  const [appointment, setAppointment] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("summary");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
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

  function openMode(nextMode) {
    setActionError("");
    setConfirmed(false);
    setMode(nextMode);
  }

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
    if (!confirmed) {
      setActionError("Confirme o cancelamento antes de continuar.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      setAppointment(await api.cancelManagedAppointment(token, reason));
      setConfirmed(false);
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
    if (!confirmed) {
      setActionError("Confirme a remarcação antes de continuar.");
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
      setAppointment(result);
      setProfessionalId(String(result.professional.id));
      setSlot("");
      setConfirmed(false);
      setMode("summary");
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
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
          <div className="manage-brand">
            <BrandMark size={42} />
            <span>{site?.wordmark || site?.name}</span>
          </div>
          <span className="eyebrow">Meu agendamento</span>
          <h1>Não foi possível abrir o link</h1>
          <StateMessage type="error" title="Link indisponível">{error}</StateMessage>
          <button className="secondary-button" type="button" onClick={onBack}>Voltar ao início</button>
        </section>
      </main>
    );
  }

  const capabilities = appointment.capabilities || fallbackCapabilities(appointment.status);
  const business = appointment.business || { name: site?.name, address: null, contact: {} };
  const terminology = appointment.terminology || {
    serviceSingular: site?.slug === "studio-cut" ? "serviço" : "procedimento",
    professionalSingular: site?.slug === "studio-cut" ? "barbeiro" : "profissional"
  };
  const whatsappUrl = waMeUrl(business.contact?.whatsapp);
  const normalizedBusinessPhone = normalizeBrazilPhone(business.contact?.phone);
  const phoneUrl = normalizedBusinessPhone ? `tel:+${normalizedBusinessPhone}` : null;
  const blockedMessage = capabilities.cancel.message || capabilities.reschedule.message;

  return (
    <main className="manage-page">
      <section className="manage-panel">
        <div className="manage-brand">
          <BrandMark size={42} />
          <span>{business.name}</span>
        </div>
        <span className="eyebrow">Meu agendamento</span>
        <div className="manage-title-row">
          <h1>Meu agendamento</h1>
          <StatusBadge status={appointment.status} />
        </div>

        <dl className="manage-details">
          <div>
            <dt>Status</dt>
            <dd><StatusBadge status={appointment.status} /></dd>
          </div>
          <div>
            <dt>{capitalize(terminology.serviceSingular)}</dt>
            <dd>{appointment.service.name}</dd>
          </div>
          <div>
            <dt>{capitalize(terminology.professionalSingular)}</dt>
            <dd>{professionalDisplayName(appointment.professional)}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{formatDate(appointment.date)}</dd>
          </div>
          <div>
            <dt>Horário</dt>
            <dd>{appointment.time}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{appointment.service.duration} minutos</dd>
          </div>
          <div className="manage-detail-wide">
            <dt>Endereço</dt>
            <dd>{business.address || "Consulte o negócio"}</dd>
          </div>
          <div className="manage-detail-wide">
            <dt>Contato</dt>
            <dd className="manage-contact">
              {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>}
              {phoneUrl && <a href={phoneUrl}>{formatBrazilPhone(business.contact.phone)}</a>}
              {!whatsappUrl && !phoneUrl && <span>Consulte o negócio</span>}
            </dd>
          </div>
        </dl>

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
            {(capabilities.reschedule.allowed || capabilities.cancel.allowed) && (
              <div className="manage-action-row">
                {capabilities.reschedule.allowed && (
                  <button className="secondary-button" type="button" onClick={() => openMode("reschedule")}>
                    Remarcar
                  </button>
                )}
                {capabilities.cancel.allowed && (
                  <button className="danger-button" type="button" onClick={() => openMode("cancel")}>
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {blockedMessage && <p className="manage-terminal">{blockedMessage}</p>}
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
            <label className="manage-confirmation">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
              />
              <span>Confirmo que desejo cancelar este agendamento.</span>
            </label>
            <div className="manage-form-actions">
              <button className="danger-button" type="submit" disabled={busy || !confirmed}>
                {busy ? "Cancelando…" : "Cancelar agendamento"}
              </button>
              <button className="secondary-button" type="button" onClick={() => openMode("summary")}>Voltar</button>
            </div>
          </form>
        )}

        {mode === "reschedule" && (
          <form className="manage-form" onSubmit={rescheduleAppointment}>
            <h2>Novo horário</h2>
            <label htmlFor="reschedule-professional">
              {capitalize(terminology.professionalSingular)}
              <select
                id="reschedule-professional"
                value={professionalId}
                onChange={(event) => setProfessionalId(event.target.value)}
                required
              >
                {availableProfessionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>{professionalDisplayName(professional)}</option>
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
            <label className="manage-confirmation">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
              />
              <span>Confirmo a troca para o novo profissional, data e horário selecionados.</span>
            </label>
            <div className="manage-form-actions">
              <button className="primary-button" type="submit" disabled={busy || !slot || !confirmed}>
                {busy ? "Remarcando…" : "Remarcar agendamento"}
              </button>
              <button className="secondary-button" type="button" onClick={() => openMode("summary")}>Voltar</button>
            </div>
          </form>
        )}

        <button className="manage-back" type="button" onClick={onBack}>Ir para a página inicial</button>
      </section>
    </main>
  );
}
