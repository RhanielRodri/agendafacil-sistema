import React, { useEffect, useState } from "react";
import { toId } from "../../utils/id.js";
import { api } from "../../services/api.js";
import { usePanelData } from "../../utils/usePanelData.js";
import { useStructuralAction } from "../../utils/useStructuralAction.js";
import {
  PanelConflict,
  PanelEmpty,
  PanelError,
  PanelLoading,
  PanelMessage
} from "../../components/panel/PanelState.jsx";
import { formatMinutes } from "../../utils/panel.js";

const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function minutesBetween(start, end) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
}

function emptyInterval(professionalId, dayOfWeek) {
  return { professionalId, dayOfWeek, startTime: "09:00", endTime: "18:00", active: true };
}

export default function Availability({ professionals, params, onSessionExpired }) {
  const activeProfessionals = professionals.filter((professional) => professional.active !== false);
  const [selectedId, setSelectedId] = useState(
    params.professionalId ? String(params.professionalId) : String(activeProfessionals[0]?.id || "")
  );
  const [hoursDraft, setHoursDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [intervalForm, setIntervalForm] = useState(null);
  const [copyForm, setCopyForm] = useState({ source: "business", fromProfessionalId: "", fromDayOfWeek: 1, targetDays: [] });

  const { state, data, error, reload } = usePanelData(async () => {
    const [businessHours, schedules] = await Promise.all([
      api.getAdminBusinessHours(),
      api.getProfessionalSchedules()
    ]);
    return { businessHours, schedules };
  }, [], onSessionExpired);

  const action = useStructuralAction({ onSessionExpired, reload });

  useEffect(() => {
    if (data?.businessHours && !hoursDraft) setHoursDraft(data.businessHours.map((day) => ({ ...day })));
  }, [data, hoursDraft]);

  useEffect(() => {
    if (!selectedId && activeProfessionals.length) setSelectedId(String(activeProfessionals[0].id));
  }, [activeProfessionals, selectedId]);

  if (state === "loading" && !data) return <PanelLoading rows={5} label="Carregando disponibilidade…" />;
  if (state === "error") return <PanelError onRetry={reload}>{error}</PanelError>;
  if (!data || !hoursDraft) return null;

  const schedules = (data.schedules || []).filter((schedule) => String(schedule.professionalId) === selectedId);
  const weekMinutes = schedules
    .filter((schedule) => schedule.active)
    .reduce((sum, schedule) => sum + minutesBetween(schedule.startTime, schedule.endTime), 0);

  function updateDay(dayOfWeek, patch) {
    setHoursDraft(hoursDraft.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)));
  }

  function copyDayToWeek(dayOfWeek) {
    const source = hoursDraft.find((day) => day.dayOfWeek === dayOfWeek);
    setHoursDraft(hoursDraft.map((day) => (day.dayOfWeek === dayOfWeek ? day : {
      ...day,
      isOpen: source.isOpen,
      openTime: source.openTime,
      closeTime: source.closeTime
    })));
  }

  function saveBusinessHours() {
    action.run(
      (confirm) => api.updateBusinessHours(
        hoursDraft.map(({ dayOfWeek, isOpen, openTime, closeTime }) => ({ dayOfWeek, isOpen, openTime, closeTime })),
        confirm
      ),
      "Horário do negócio atualizado."
    );
  }

  function submitInterval(event) {
    event.preventDefault();
    const payload = {
      professionalId: toId(intervalForm.professionalId),
      dayOfWeek: Number(intervalForm.dayOfWeek),
      startTime: intervalForm.startTime,
      endTime: intervalForm.endTime,
      active: intervalForm.active
    };
    action.run(
      (confirm) => (editingId
        ? api.updateProfessionalSchedule(editingId, { ...payload, confirm })
        : api.createProfessionalSchedule(payload)),
      editingId ? "Intervalo atualizado." : "Intervalo criado."
    ).then((ok) => {
      if (ok) {
        setEditingId(null);
        setIntervalForm(null);
      }
    });
  }

  function submitCopy(event) {
    event.preventDefault();
    const payload = {
      targetProfessionalId: toId(selectedId),
      source: copyForm.source,
      ...(copyForm.source === "professional" ? { fromProfessionalId: toId(copyForm.fromProfessionalId) } : {}),
      ...(copyForm.source === "day"
        ? { fromProfessionalId: toId(selectedId), fromDayOfWeek: Number(copyForm.fromDayOfWeek) }
        : {}),
      ...(copyForm.targetDays.length ? { targetDays: copyForm.targetDays } : {})
    };
    action.run((confirm) => api.copyProfessionalSchedules({ ...payload, confirm }), "Agenda copiada.");
  }

  const selectedName = professionals.find((professional) => String(professional.id) === selectedId)?.name;

  return (
    <>
      <PanelMessage message={action.message} onDismiss={() => action.setMessage(null)} />
      {action.conflict && (
        <PanelConflict
          title={action.conflict.title}
          conflicts={action.conflict.conflicts}
          onConfirm={action.conflict.confirm}
          onCancel={action.dismissConflict}
        />
      )}

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Horário geral do negócio</h2>
          <p>Limite externo de toda agenda — um intervalo por dia</p>
        </div>

        <div className="panel-week">
          {hoursDraft.map((day) => (
            <div className={`panel-week-row${day.isOpen ? "" : " panel-week-row--closed"}`} key={day.dayOfWeek}>
              <label className="panel-week-day">
                <input
                  type="checkbox"
                  checked={day.isOpen}
                  onChange={(event) => updateDay(day.dayOfWeek, { isOpen: event.target.checked })}
                />
                <span>{weekDays[day.dayOfWeek]}</span>
              </label>
              <label className="panel-field">
                Abre
                <input
                  type="time"
                  value={day.openTime}
                  disabled={!day.isOpen}
                  onChange={(event) => updateDay(day.dayOfWeek, { openTime: event.target.value })}
                />
              </label>
              <label className="panel-field">
                Fecha
                <input
                  type="time"
                  value={day.closeTime}
                  disabled={!day.isOpen}
                  onChange={(event) => updateDay(day.dayOfWeek, { closeTime: event.target.value })}
                />
              </label>
              <span className="panel-week-total">
                {day.isOpen ? formatMinutes(Math.max(0, minutesBetween(day.openTime, day.closeTime))) : "Fechado"}
              </span>
              <button className="panel-btn" type="button" onClick={() => copyDayToWeek(day.dayOfWeek)}>
                Copiar para os outros dias
              </button>
            </div>
          ))}
        </div>

        <div className="panel-form-actions">
          <button className="panel-btn-primary" type="button" onClick={saveBusinessHours} disabled={action.busy}>
            Salvar horário do negócio
          </button>
          <button
            className="panel-btn"
            type="button"
            onClick={() => setHoursDraft(data.businessHours.map((day) => ({ ...day })))}
          >
            Descartar alterações
          </button>
        </div>
        <p className="panel-hint">
          A estrutura atual aceita um intervalo por dia. Pausas dentro do expediente são
          configuradas na agenda individual ou como bloqueio.
        </p>
      </section>

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Agenda individual</h2>
          <p>Janelas de trabalho dentro do horário do negócio</p>
        </div>

        <div className="panel-toolbar">
          <label className="panel-field">
            Profissional
            <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setIntervalForm(null); setEditingId(null); }}>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}{professional.active === false ? " (inativo)" : ""}
                </option>
              ))}
            </select>
          </label>
          <span className="panel-toolbar-spacer" />
          <strong className="panel-week-total">{formatMinutes(weekMinutes)} por semana</strong>
          <button
            className="panel-btn"
            type="button"
            onClick={() => { setEditingId(null); setIntervalForm(emptyInterval(selectedId, 1)); }}
          >
            Novo intervalo
          </button>
        </div>

        {intervalForm && (
          <form className="panel-form-grid" onSubmit={submitInterval}>
            <label className="panel-field">
              Dia
              <select
                value={intervalForm.dayOfWeek}
                onChange={(event) => setIntervalForm({ ...intervalForm, dayOfWeek: Number(event.target.value) })}
              >
                {weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
            <label className="panel-field">
              Início
              <input
                type="time"
                value={intervalForm.startTime}
                onChange={(event) => setIntervalForm({ ...intervalForm, startTime: event.target.value })}
                required
              />
            </label>
            <label className="panel-field">
              Fim
              <input
                type="time"
                value={intervalForm.endTime}
                onChange={(event) => setIntervalForm({ ...intervalForm, endTime: event.target.value })}
                required
              />
            </label>
            <label className="panel-field">
              <span>
                <input
                  type="checkbox"
                  checked={intervalForm.active}
                  onChange={(event) => setIntervalForm({ ...intervalForm, active: event.target.checked })}
                /> Ativo
              </span>
            </label>
            <div className="panel-form-actions">
              <button className="panel-btn-primary" type="submit" disabled={action.busy}>
                {editingId ? "Salvar intervalo" : "Adicionar intervalo"}
              </button>
              <button className="panel-btn" type="button" onClick={() => { setIntervalForm(null); setEditingId(null); }}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {schedules.length === 0 ? (
          <PanelEmpty
            title="Sem agenda configurada"
            actionLabel="Copiar horário do negócio"
            onAction={() => action.run(
              (confirm) => api.copyProfessionalSchedules({ targetProfessionalId: toId(selectedId), source: "business", confirm }),
              "Agenda copiada do horário do negócio."
            )}
          >
            {selectedName} não recebe agendamentos enquanto não tiver janelas de trabalho.
          </PanelEmpty>
        ) : (
          <div className="panel-list">
            {schedules.map((schedule) => (
              <div className={`panel-row${schedule.active ? "" : " panel-row--muted"}`} key={schedule.id}>
                <div className="panel-row-time">{schedule.startTime}<small>{schedule.endTime}</small></div>
                <div className="panel-row-main">
                  <strong>{weekDays[schedule.dayOfWeek]}</strong>
                  <span>{formatMinutes(minutesBetween(schedule.startTime, schedule.endTime))}</span>
                </div>
                <div className="panel-row-cell" />
                <div className="panel-row-cell" />
                <div className="panel-row-status">
                  <span className={`panel-status ${schedule.active ? "confirmed" : "cancelled"}`}>
                    {schedule.active ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <div className="panel-row-actions">
                  <button
                    className="panel-btn"
                    type="button"
                    onClick={() => {
                      setEditingId(schedule.id);
                      setIntervalForm({
                        professionalId: String(schedule.professionalId),
                        dayOfWeek: schedule.dayOfWeek,
                        startTime: schedule.startTime,
                        endTime: schedule.endTime,
                        active: schedule.active
                      });
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="panel-btn"
                    type="button"
                    onClick={() => action.run(
                      (confirm) => api.deleteProfessionalSchedule(schedule.id, confirm),
                      "Intervalo removido."
                    )}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Copiar horários</h2>
          <p>Substitui os dias escolhidos de {selectedName || "quem estiver selecionado"}</p>
        </div>
        <form className="panel-form-grid" onSubmit={submitCopy}>
          <label className="panel-field">
            Origem
            <select value={copyForm.source} onChange={(event) => setCopyForm({ ...copyForm, source: event.target.value })}>
              <option value="business">Horário do negócio</option>
              <option value="professional">Semana de outro profissional</option>
              <option value="day">Um dia deste profissional</option>
            </select>
          </label>
          {copyForm.source === "professional" && (
            <label className="panel-field">
              Profissional de origem
              <select
                value={copyForm.fromProfessionalId}
                onChange={(event) => setCopyForm({ ...copyForm, fromProfessionalId: event.target.value })}
                required
              >
                <option value="">Selecione</option>
                {professionals
                  .filter((professional) => String(professional.id) !== selectedId)
                  .map((professional) => (
                    <option key={professional.id} value={professional.id}>{professional.name}</option>
                  ))}
              </select>
            </label>
          )}
          {copyForm.source === "day" && (
            <label className="panel-field">
              Dia de origem
              <select
                value={copyForm.fromDayOfWeek}
                onChange={(event) => setCopyForm({ ...copyForm, fromDayOfWeek: Number(event.target.value) })}
              >
                {weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
          )}
          <fieldset className="panel-checklist panel-checklist--inline">
            <legend>Dias alvo (vazio = semana inteira)</legend>
            {weekDays.map((day, index) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={copyForm.targetDays.includes(index)}
                  onChange={(event) => setCopyForm({
                    ...copyForm,
                    targetDays: event.target.checked
                      ? [...copyForm.targetDays, index]
                      : copyForm.targetDays.filter((value) => value !== index)
                  })}
                />
                <span>{day.slice(0, 3)}</span>
              </label>
            ))}
          </fieldset>
          <div className="panel-form-actions">
            <button className="panel-btn-primary" type="submit" disabled={action.busy}>Copiar</button>
          </div>
        </form>
      </section>
    </>
  );
}
