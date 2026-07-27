import React, { useEffect, useState } from "react";
import { api } from "../../services/api.js";
import { usePanelData } from "../../utils/usePanelData.js";
import { useStructuralAction } from "../../utils/useStructuralAction.js";
import { PanelError, PanelLoading, PanelMessage } from "../../components/panel/PanelState.jsx";

const timezones = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha"
];

const slotDurations = [10, 15, 20, 30, 45, 60];

const advanceOptions = [
  { value: 0, label: "Sem antecedência mínima" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 180, label: "3 horas" },
  { value: 240, label: "4 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "1 dia" },
  { value: 2880, label: "2 dias" },
  { value: 10080, label: "7 dias" }
];

function toForm(settings) {
  return {
    publicName: settings.publicName || "",
    publicPhone: settings.publicPhone || "",
    publicWhatsapp: settings.publicWhatsapp || "",
    addressLine: settings.addressLine || "",
    timezone: settings.timezone,
    slotDurationMinutes: settings.slotDurationMinutes,
    minAdvanceMinutes: settings.minAdvanceMinutes,
    changeMinAdvanceMinutes: settings.changeMinAdvanceMinutes,
    maxFutureDays: settings.maxFutureDays,
    cancellationPolicy: settings.cancellationPolicy || "",
    confirmationMessage: settings.confirmationMessage || "",
    bookingEnabled: settings.bookingEnabled
  };
}

export default function Settings({ tenantId, onSessionExpired }) {
  const [form, setForm] = useState(null);
  const { state, data, error, reload } = usePanelData(() => api.getAdminSettings(), [], onSessionExpired);
  const action = useStructuralAction({ onSessionExpired, reload });

  useEffect(() => {
    if (data && !form) setForm(toForm(data));
  }, [data, form]);

  if (state === "loading" && !data) return <PanelLoading rows={5} label="Carregando configurações…" />;
  if (state === "error") return <PanelError onRetry={reload}>{error}</PanelError>;
  if (!form) return null;

  function submit(event) {
    event.preventDefault();
    action.run(() => api.updateAdminSettings({
      publicName: form.publicName || null,
      publicPhone: form.publicPhone || null,
      publicWhatsapp: form.publicWhatsapp || null,
      addressLine: form.addressLine || null,
      timezone: form.timezone,
      slotDurationMinutes: Number(form.slotDurationMinutes),
      minAdvanceMinutes: Number(form.minAdvanceMinutes),
      changeMinAdvanceMinutes: Number(form.changeMinAdvanceMinutes),
      maxFutureDays: Number(form.maxFutureDays),
      cancellationPolicy: form.cancellationPolicy || null,
      confirmationMessage: form.confirmationMessage || null,
      bookingEnabled: form.bookingEnabled
    }), "Configurações salvas.");
  }

  return (
    <>
      <PanelMessage message={action.message} onDismiss={() => action.setMessage(null)} />

      <form onSubmit={submit}>
        <section className="panel-block">
          <div className="panel-block-head">
            <h2>Informações públicas</h2>
            <p>Aparecem para o cliente final — nada aqui é segredo operacional</p>
          </div>
          <div className="panel-form-grid">
            <label className="panel-field">
              Nome público
              <input
                type="text"
                maxLength="120"
                value={form.publicName}
                onChange={(event) => setForm({ ...form, publicName: event.target.value })}
                placeholder={tenantId}
              />
            </label>
            <label className="panel-field">
              Telefone
              <input
                type="tel"
                maxLength="30"
                value={form.publicPhone}
                onChange={(event) => setForm({ ...form, publicPhone: event.target.value })}
                placeholder="(27) 99999-0000"
              />
            </label>
            <label className="panel-field">
              WhatsApp
              <input
                type="tel"
                maxLength="30"
                value={form.publicWhatsapp}
                onChange={(event) => setForm({ ...form, publicWhatsapp: event.target.value })}
              />
            </label>
            <label className="panel-field" style={{ gridColumn: "span 2" }}>
              Endereço curto
              <input
                type="text"
                maxLength="160"
                value={form.addressLine}
                onChange={(event) => setForm({ ...form, addressLine: event.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-block-head">
            <h2>Regras de agendamento</h2>
            <p>Valem para o agendamento público deste negócio</p>
          </div>
          <div className="panel-form-grid">
            <label className="panel-field">
              Fuso horário
              <select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}>
                {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </label>
            <label className="panel-field">
              Intervalo entre horários
              <select
                value={form.slotDurationMinutes}
                onChange={(event) => setForm({ ...form, slotDurationMinutes: event.target.value })}
              >
                {slotDurations.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}
              </select>
            </label>
            <label className="panel-field">
              Antecedência mínima
              <select
                value={form.minAdvanceMinutes}
                onChange={(event) => setForm({ ...form, minAdvanceMinutes: event.target.value })}
              >
                {advanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="panel-field">
              Prazo para cancelar ou remarcar
              <select
                value={form.changeMinAdvanceMinutes}
                onChange={(event) => setForm({ ...form, changeMinAdvanceMinutes: event.target.value })}
              >
                {advanceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="panel-field">
              Limite futuro (dias)
              <input
                type="number"
                min="1"
                max="365"
                value={form.maxFutureDays}
                onChange={(event) => setForm({ ...form, maxFutureDays: event.target.value })}
                required
              />
            </label>
            <label className="panel-field">
              <span>
                <input
                  type="checkbox"
                  checked={form.bookingEnabled}
                  onChange={(event) => setForm({ ...form, bookingEnabled: event.target.checked })}
                /> Aceitar novos agendamentos on-line
              </span>
            </label>
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-block-head">
            <h2>Textos operacionais</h2>
            <p>Texto simples, sem HTML e com limite de caracteres</p>
          </div>
          <div className="panel-form-grid">
            <label className="panel-field" style={{ gridColumn: "span 3" }}>
              Política de cancelamento
              <textarea
                maxLength="500"
                rows="3"
                value={form.cancellationPolicy}
                onChange={(event) => setForm({ ...form, cancellationPolicy: event.target.value })}
              />
            </label>
            <label className="panel-field" style={{ gridColumn: "span 3" }}>
              Texto da confirmação
              <textarea
                maxLength="300"
                rows="2"
                value={form.confirmationMessage}
                onChange={(event) => setForm({ ...form, confirmationMessage: event.target.value })}
              />
            </label>
          </div>
          <div className="panel-form-actions">
            <button className="panel-btn-primary" type="submit" disabled={action.busy}>Salvar configurações</button>
            <button className="panel-btn" type="button" onClick={() => setForm(toForm(data))}>Descartar alterações</button>
          </div>
        </section>
      </form>
    </>
  );
}
