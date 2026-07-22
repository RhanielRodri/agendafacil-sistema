import React, { useState } from "react";
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
import { relativeDayLabel, todayIso } from "../../utils/panel.js";

function emptyForm() {
  return { professionalId: "", date: todayIso(), allDay: true, startTime: "12:00", endTime: "13:00", reason: "" };
}

export default function Blocks({ professionals, onSessionExpired }) {
  const [scope, setScope] = useState("future");
  const [professionalFilter, setProfessionalFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const { state, data, error, reload } = usePanelData(
    () => api.getScheduleBlocks({ scope, professionalId: professionalFilter }),
    [scope, professionalFilter],
    onSessionExpired
  );

  const action = useStructuralAction({ onSessionExpired, reload });

  function submit(event) {
    event.preventDefault();
    const payload = {
      professionalId: toId(form.professionalId),
      date: form.date,
      allDay: form.allDay,
      startTime: form.allDay ? null : form.startTime,
      endTime: form.allDay ? null : form.endTime,
      reason: form.reason
    };
    action.run(
      (confirm) => (editingId
        ? api.updateScheduleBlock(editingId, { ...payload, confirm })
        : api.createScheduleBlock({ ...payload, confirm })),
      editingId ? "Bloqueio atualizado." : "Bloqueio criado."
    ).then((ok) => {
      if (ok) {
        setForm(emptyForm());
        setEditingId(null);
      }
    });
  }

  const blocks = Array.isArray(data) ? data : [];

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
          <h2>{editingId ? "Editar bloqueio" : "Novo bloqueio"}</h2>
          <p>O motivo fica só no painel — nenhuma rota pública devolve esse texto</p>
        </div>
        <form className="panel-form-grid" onSubmit={submit}>
          <label className="panel-field">
            Data
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              required
            />
          </label>
          <label className="panel-field">
            Aplicar a
            <select
              value={form.professionalId}
              onChange={(event) => setForm({ ...form, professionalId: event.target.value })}
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
                checked={form.allDay}
                onChange={(event) => setForm({ ...form, allDay: event.target.checked })}
              /> Dia inteiro
            </span>
          </label>
          {!form.allDay && (
            <>
              <label className="panel-field">
                Início
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                  required
                />
              </label>
              <label className="panel-field">
                Fim
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                  required
                />
              </label>
            </>
          )}
          <label className="panel-field" style={{ gridColumn: "span 2" }}>
            Motivo interno
            <input
              type="text"
              maxLength="200"
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              placeholder="Pausa, folga, manutenção…"
            />
          </label>
          <div className="panel-form-actions">
            <button className="panel-btn-primary" type="submit" disabled={action.busy}>
              {editingId ? "Salvar bloqueio" : "Criar bloqueio"}
            </button>
            {editingId && (
              <button className="panel-btn" type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <div className="panel-toolbar">
        <label className="panel-field">
          Período
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="future">Futuros</option>
            <option value="past">Passados</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <label className="panel-field">
          Profissional
          <select value={professionalFilter} onChange={(event) => setProfessionalFilter(event.target.value)}>
            <option value="">Todos</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>{professional.name}</option>
            ))}
          </select>
        </label>
        <span className="panel-toolbar-spacer" />
        <button className="panel-btn" type="button" onClick={reload}>Atualizar</button>
      </div>

      {state === "loading" && !data && <PanelLoading rows={4} label="Carregando bloqueios…" />}
      {state === "error" && <PanelError onRetry={reload}>{error}</PanelError>}

      {data && (blocks.length === 0 ? (
        <PanelEmpty
          title="Nenhum bloqueio no período"
          actionLabel={professionalFilter || scope !== "future" ? "Limpar filtros" : undefined}
          onAction={professionalFilter || scope !== "future"
            ? () => { setScope("future"); setProfessionalFilter(""); }
            : undefined}
        >
          Bloqueios tiram horários da disponibilidade sem cancelar nada que já esteja marcado.
        </PanelEmpty>
      ) : (
        <div className="panel-list">
          {blocks.map((block) => (
            <div className="panel-row" key={block.id}>
              <div className="panel-row-time">
                {block.date.slice(8, 10)}/{block.date.slice(5, 7)}
                <small>{relativeDayLabel(block.date.slice(0, 10))}</small>
              </div>
              <div className="panel-row-main">
                <strong>{block.professional?.name || "Todo o negócio"}</strong>
                <span>{block.allDay ? "Dia inteiro" : `${block.startTime}–${block.endTime}`}</span>
              </div>
              <div className="panel-row-cell">
                <strong>{block.reason || "Sem motivo registrado"}</strong>
                <span>Visível apenas no painel</span>
              </div>
              <div className="panel-row-cell" />
              <div className="panel-row-status" />
              <div className="panel-row-actions">
                <button
                  className="panel-btn"
                  type="button"
                  onClick={() => {
                    setEditingId(block.id);
                    setForm({
                      professionalId: block.professionalId ? String(block.professionalId) : "",
                      date: block.date.slice(0, 10),
                      allDay: block.allDay,
                      startTime: block.startTime || "12:00",
                      endTime: block.endTime || "13:00",
                      reason: block.reason || ""
                    });
                  }}
                >
                  Editar
                </button>
                <button
                  className="panel-btn"
                  type="button"
                  onClick={() => action.run(() => api.deleteScheduleBlock(block.id), "Bloqueio removido.")}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
