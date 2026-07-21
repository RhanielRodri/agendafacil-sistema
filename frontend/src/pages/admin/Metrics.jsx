import React, { useState } from "react";
import { api } from "../../services/api.js";
import { usePanelData } from "../../utils/usePanelData.js";
import { PanelEmpty, PanelError, PanelLoading } from "../../components/panel/PanelState.jsx";
import {
  appointmentStatusLabels,
  formatMinutes,
  leadSourceLabels,
  leadStatusLabels,
  shiftIsoDay,
  todayIso
} from "../../utils/panel.js";

const periods = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "custom", label: "Personalizado" }
];

function percent(value) {
  return value === null || value === undefined ? "—" : `${String(value).replace(".", ",")}%`;
}

function duration(minutes) {
  return minutes === null || minutes === undefined ? "—" : formatMinutes(minutes);
}

function Figure({ label, value, hint }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export default function Metrics({ vertical, onSessionExpired }) {
  const [period, setPeriod] = useState("30d");
  const [from, setFrom] = useState(shiftIsoDay(todayIso(), -13));
  const [to, setTo] = useState(todayIso());

  const { state, data, error, reload } = usePanelData(
    () => api.getMetrics(period === "custom" ? { period, from, to } : { period }),
    [period, period === "custom" ? from : "", period === "custom" ? to : ""],
    onSessionExpired
  );

  const highlights = vertical.metricHighlights || [];

  return (
    <>
      <div className="panel-toolbar">
        <div className="panel-segmented" role="group" aria-label="Período dos indicadores">
          {periods.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={period === item.id}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <>
            <label className="panel-field">
              De
              <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="panel-field">
              Até
              <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
            </label>
          </>
        )}
        <span className="panel-toolbar-spacer" />
        <button className="panel-btn" type="button" onClick={reload}>Atualizar</button>
      </div>

      {state === "loading" && !data && <PanelLoading rows={6} label="Calculando indicadores…" />}
      {state === "error" && <PanelError onRetry={reload}>{error}</PanelError>}

      {data && (
        <>
          <p className="panel-hint">
            Período de {data.period.from.slice(8, 10)}/{data.period.from.slice(5, 7)} a{" "}
            {data.period.to.slice(8, 10)}/{data.period.to.slice(5, 7)} · {data.period.days} dia(s).
            Os números vêm do que está registrado no sistema — não há receita, ticket nem projeção.
          </p>

          <section className="panel-block">
            <div className="panel-block-head">
              <h2>Agendamentos</h2>
              <p>Comparecimento é medido sobre o que já foi encerrado</p>
            </div>
            <div className="panel-detail-facts">
              <Figure label="Total no período" value={data.appointments.total} />
              {Object.entries(data.appointments.byStatus).map(([status, value]) => (
                <Figure key={status} label={appointmentStatusLabels[status]} value={value} />
              ))}
              <Figure label="Reagendados" value={data.appointments.rescheduled} />
              <Figure label="Taxa de comparecimento" value={percent(data.appointments.attendanceRate)} hint="concluídos ÷ encerrados" />
              <Figure label="Taxa de cancelamento" value={percent(data.appointments.cancellationRate)} hint="cancelados ÷ total" />
              <Figure label="Taxa de não comparecimento" value={percent(data.appointments.noShowRate)} hint="no-show ÷ encerrados" />
            </div>
          </section>

          <section className="panel-block">
            <div className="panel-block-head">
              <h2>Capacidade</h2>
              <p>Expediente aberto menos bloqueios, comparado ao tempo já agendado</p>
            </div>
            <div className="panel-detail-facts">
              <Figure label="Tempo aberto" value={duration(data.capacity.openMinutes)} />
              <Figure label="Tempo ocupado" value={duration(data.capacity.bookedMinutes)} />
              <Figure label="Tempo livre" value={duration(data.capacity.freeMinutes)} />
              <Figure label="Ocupação" value={percent(data.capacity.occupancyRate)} />
              <Figure label="Horários estimados" value={data.capacity.estimatedOpenSlots} hint="pela duração de slot configurada" />
              <Figure label="Horários ocupados" value={data.capacity.estimatedBookedSlots} />
            </div>

            {(highlights.includes("occupancyByProfessional") || vertical.showOccupancy) && (
              <div className="panel-list">
                {data.capacity.byProfessional.length === 0 && (
                  <div className="panel-row"><span>Nenhum profissional ativo com agenda no período.</span></div>
                )}
                {data.capacity.byProfessional.map((row) => (
                  <div className="panel-row" key={row.professionalId}>
                    <div className="panel-row-time">{percent(row.occupancyRate)}</div>
                    <div className="panel-row-main">
                      <strong>{row.name}</strong>
                      <span>{duration(row.bookedMinutes)} ocupados de {duration(row.openMinutes)}</span>
                    </div>
                    <div className="panel-row-cell">
                      <strong>{duration(row.freeMinutes)}</strong>
                      <span>livre</span>
                    </div>
                    <div className="panel-row-cell" />
                    <div className="panel-row-status" />
                    <div className="panel-row-actions" />
                  </div>
                ))}
              </div>
            )}

            <h3 className="panel-subhead">
              {vertical.servicePlural} por tempo ocupado
            </h3>
            <div className="panel-list">
              {data.capacity.byService.length === 0 && (
                <div className="panel-row"><span>Nada agendado no período.</span></div>
              )}
              {data.capacity.byService.slice(0, 8).map((row) => (
                <div className="panel-row" key={row.serviceId}>
                  <div className="panel-row-time">{percent(row.shareOfBookedTime)}</div>
                  <div className="panel-row-main">
                    <strong>{row.name}</strong>
                    <span>{row.appointments} agendamento(s)</span>
                  </div>
                  <div className="panel-row-cell">
                    <strong>{duration(row.bookedMinutes)}</strong>
                    <span>duração agendada</span>
                  </div>
                  <div className="panel-row-cell" />
                  <div className="panel-row-status" />
                  <div className="panel-row-actions" />
                </div>
              ))}
            </div>
          </section>

          <section className="panel-block">
            <div className="panel-block-head">
              <h2>Leads</h2>
              <p>Etapas contadas pelo estado atual dos leads criados no período</p>
            </div>
            <div className="panel-detail-facts">
              <Figure label="Criados" value={data.leads.created} />
              {Object.entries(data.leads.byStatus).map(([status, value]) => (
                <Figure key={status} label={leadStatusLabels[status]} value={value} />
              ))}
              <Figure label="Conversão" value={percent(data.leads.conversionRate)} />
              <Figure label="Sem responsável" value={data.leads.withoutOwner} />
              <Figure label="Sem próxima ação" value={data.leads.withoutNextAction} />
              <Figure
                label="Até a primeira ação"
                value={duration(data.leads.averageMinutesToFirstAction)}
                hint="média dos leads com ação registrada"
              />
            </div>

            <h3 className="panel-subhead">Conversão por origem</h3>
            <div className="panel-list">
              {data.leads.bySource.filter((row) => row.created > 0).length === 0 && (
                <div className="panel-row"><span>Nenhum lead criado no período.</span></div>
              )}
              {data.leads.bySource.filter((row) => row.created > 0).map((row) => (
                <div className="panel-row" key={row.source}>
                  <div className="panel-row-time">{percent(row.conversionRate)}</div>
                  <div className="panel-row-main">
                    <strong>{leadSourceLabels[row.source] || row.source}</strong>
                    <span>{row.created} criado(s)</span>
                  </div>
                  <div className="panel-row-cell">
                    <strong>{row.converted}</strong>
                    <span>convertido(s)</span>
                  </div>
                  <div className="panel-row-cell" />
                  <div className="panel-row-status" />
                  <div className="panel-row-actions" />
                </div>
              ))}
            </div>
          </section>

          <section className="panel-block">
            <div className="panel-block-head">
              <h2>Follow-ups e clientes</h2>
              <p>Recorrência usa uma janela fixa de {data.clients.returnWindowDays} dias</p>
            </div>
            <div className="panel-detail-facts">
              <Figure label="Follow-ups criados" value={data.followUps.created} />
              <Figure label="Concluídos" value={data.followUps.completed} />
              <Figure label="Vencidos em aberto" value={data.followUps.overdue} />
              <Figure label="Atraso médio" value={duration(data.followUps.averageDelayMinutes)} hint="entre os concluídos com atraso" />
              <Figure label="Clientes novos" value={data.clients.created} />
              <Figure label="Com atendimento no período" value={data.clients.withAppointments} />
              <Figure label="Com mais de um agendamento" value={data.clients.withMoreThanOne} />
              <Figure
                label="Sem retorno recente"
                value={data.clients.withoutRecentReturn}
                hint={`último atendimento concluído há mais de ${data.clients.returnWindowDays} dias`}
              />
            </div>
          </section>

          {data.appointments.total === 0 && data.leads.created === 0 && (
            <PanelEmpty title="Período sem movimento">
              Nenhum agendamento e nenhum lead registrado nesse intervalo.
            </PanelEmpty>
          )}
        </>
      )}
    </>
  );
}
