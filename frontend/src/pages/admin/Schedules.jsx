import React, { useEffect, useState } from "react";
import { api } from "../../services/api.js";
import { usePanelData } from "../../utils/usePanelData.js";
import { PanelError, PanelLoading, PanelMessage } from "../../components/panel/PanelState.jsx";
import { todayIso } from "../../utils/panel.js";

const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function blockWindow() {
  const from = todayIso();
  const end = new Date(`${from}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 180);
  return { from, to: end.toISOString().slice(0, 10) };
}

function emptySchedule(professionalId = "") {
  return { professionalId, dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true };
}

function emptyBlock() {
  return { professionalId: "", date: todayIso(), allDay: true, startTime: "09:00", endTime: "10:00", reason: "" };
}

export default function Schedules({ professionals, onSessionExpired }) {
  const [message, setMessage] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(emptySchedule);
  const [blockForm, setBlockForm] = useState(emptyBlock);

  const { state, data, error, reload } = usePanelData(async () => {
    const { from, to } = blockWindow();
    const [schedules, blocks] = await Promise.all([
      api.getProfessionalSchedules(),
      api.getScheduleBlocks(from, to)
    ]);
    return { schedules, blocks };
  }, [], onSessionExpired);

  useEffect(() => {
    if (!scheduleForm.professionalId && professionals.length) {
      setScheduleForm((current) => ({ ...current, professionalId: String(professionals[0].id) }));
    }
  }, [professionals, scheduleForm.professionalId]);

  async function run(action, successText) {
    setMessage(null);
    try {
      await action();
      setMessage({ type: "success", text: successText });
      await reload();
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    }
  }

  function submitSchedule(event) {
    event.preventDefault();
    const payload = {
      ...scheduleForm,
      professionalId: Number(scheduleForm.professionalId),
      dayOfWeek: Number(scheduleForm.dayOfWeek)
    };
    run(async () => {
      if (editingId) await api.updateProfessionalSchedule(editingId, payload);
      else await api.createProfessionalSchedule(payload);
      setEditingId(null);
      setScheduleForm(emptySchedule(scheduleForm.professionalId));
    }, editingId ? "Horário atualizado." : "Horário criado.");
  }

  function submitBlock(event) {
    event.preventDefault();
    const payload = {
      professionalId: blockForm.professionalId ? Number(blockForm.professionalId) : null,
      date: blockForm.date,
      allDay: blockForm.allDay,
      startTime: blockForm.allDay ? null : blockForm.startTime,
      endTime: blockForm.allDay ? null : blockForm.endTime,
      reason: blockForm.reason
    };
    run(async () => {
      await api.createScheduleBlock(payload);
      setBlockForm(emptyBlock());
    }, "Bloqueio criado.");
  }

  if (state === "loading" && !data) return <PanelLoading rows={4} label="Carregando horários…" />;
  if (state === "error") return <PanelError onRetry={reload}>{error}</PanelError>;
  if (!data) return null;

  const schedules = (data.schedules || []).filter(
    (schedule) => String(schedule.professionalId) === String(scheduleForm.professionalId)
  );

  return (
    <>
      <PanelMessage message={message} onDismiss={() => setMessage(null)} />

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Horários por profissional</h2>
          <p>Janelas de expediente usadas pela agenda e pela disponibilidade pública</p>
        </div>

        <form className="panel-toolbar" onSubmit={submitSchedule}>
          <label className="panel-field">
            Profissional
            <select
              value={scheduleForm.professionalId}
              onChange={(event) => setScheduleForm({ ...scheduleForm, professionalId: event.target.value })}
              required
            >
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>{professional.name}</option>
              ))}
            </select>
          </label>
          <label className="panel-field">
            Dia
            <select
              value={scheduleForm.dayOfWeek}
              onChange={(event) => setScheduleForm({ ...scheduleForm, dayOfWeek: Number(event.target.value) })}
            >
              {weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <label className="panel-field">
            Início
            <input
              type="time"
              value={scheduleForm.startTime}
              onChange={(event) => setScheduleForm({ ...scheduleForm, startTime: event.target.value })}
              required
            />
          </label>
          <label className="panel-field">
            Fim
            <input
              type="time"
              value={scheduleForm.endTime}
              onChange={(event) => setScheduleForm({ ...scheduleForm, endTime: event.target.value })}
              required
            />
          </label>
          <label className="panel-field">
            <span>
              <input
                type="checkbox"
                checked={scheduleForm.active}
                onChange={(event) => setScheduleForm({ ...scheduleForm, active: event.target.checked })}
              /> Ativo
            </span>
          </label>
          <button className="panel-btn-primary" type="submit">
            {editingId ? "Salvar horário" : "Adicionar horário"}
          </button>
          {editingId && (
            <button
              className="panel-btn"
              type="button"
              onClick={() => { setEditingId(null); setScheduleForm(emptySchedule(scheduleForm.professionalId)); }}
            >
              Cancelar
            </button>
          )}
        </form>

        <div className="panel-list">
          {schedules.length === 0 && <div className="panel-row"><span>Nenhuma janela cadastrada para este profissional.</span></div>}
          {schedules.map((schedule) => (
            <div className="panel-row" key={schedule.id}>
              <div className="panel-row-time">{schedule.startTime}<small>{schedule.endTime}</small></div>
              <div className="panel-row-main">
                <strong>{weekDays[schedule.dayOfWeek]}</strong>
                <span>{schedule.active ? "Janela ativa" : "Janela inativa"}</span>
              </div>
              <div className="panel-row-cell" />
              <div className="panel-row-cell" />
              <div className="panel-row-status" />
              <div className="panel-row-actions">
                <button
                  className="panel-btn"
                  type="button"
                  onClick={() => {
                    setEditingId(schedule.id);
                    setScheduleForm({
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
                  onClick={() => run(() => api.deleteProfessionalSchedule(schedule.id), "Horário removido.")}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-block-head">
          <h2>Bloqueios</h2>
          <p>Pausas e indisponibilidades dos próximos 180 dias</p>
        </div>

        <form className="panel-toolbar" onSubmit={submitBlock}>
          <label className="panel-field">
            Data
            <input
              type="date"
              value={blockForm.date}
              onChange={(event) => setBlockForm({ ...blockForm, date: event.target.value })}
              required
            />
          </label>
          <label className="panel-field">
            Aplicar a
            <select
              value={blockForm.professionalId}
              onChange={(event) => setBlockForm({ ...blockForm, professionalId: event.target.value })}
            >
              <option value="">Todo o negócio</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>{professional.name}</option>
              ))}
            </select>
          </label>
          <label className="panel-field">
            <span>
              <input
                type="checkbox"
                checked={blockForm.allDay}
                onChange={(event) => setBlockForm({ ...blockForm, allDay: event.target.checked })}
              /> Dia inteiro
            </span>
          </label>
          {!blockForm.allDay && (
            <>
              <label className="panel-field">
                Início
                <input
                  type="time"
                  value={blockForm.startTime}
                  onChange={(event) => setBlockForm({ ...blockForm, startTime: event.target.value })}
                  required
                />
              </label>
              <label className="panel-field">
                Fim
                <input
                  type="time"
                  value={blockForm.endTime}
                  onChange={(event) => setBlockForm({ ...blockForm, endTime: event.target.value })}
                  required
                />
              </label>
            </>
          )}
          <label className="panel-field" style={{ flex: "1 1 180px" }}>
            Motivo opcional
            <input
              type="text"
              maxLength="200"
              value={blockForm.reason}
              onChange={(event) => setBlockForm({ ...blockForm, reason: event.target.value })}
            />
          </label>
          <button className="panel-btn-primary" type="submit">Criar bloqueio</button>
        </form>

        <div className="panel-list">
          {(data.blocks || []).length === 0 && <div className="panel-row"><span>Nenhum bloqueio cadastrado.</span></div>}
          {(data.blocks || []).map((block) => (
            <div className="panel-row" key={block.id}>
              <div className="panel-row-time">{block.date.slice(8, 10)}/{block.date.slice(5, 7)}</div>
              <div className="panel-row-main">
                <strong>{block.professional?.name || "Todo o negócio"}</strong>
                <span>{block.allDay ? "Dia inteiro" : `${block.startTime}–${block.endTime}`}</span>
              </div>
              <div className="panel-row-cell">
                {block.reason && <strong>{block.reason}</strong>}
              </div>
              <div className="panel-row-cell" />
              <div className="panel-row-status" />
              <div className="panel-row-actions">
                <button
                  className="panel-btn"
                  type="button"
                  onClick={() => run(() => api.deleteScheduleBlock(block.id), "Bloqueio removido.")}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
