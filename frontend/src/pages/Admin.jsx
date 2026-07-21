import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import AppointmentCard from "../components/AppointmentCard.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { formatCurrency, todayInputValue } from "../utils/format.js";
import tenant from "../config/tenant.js";
import RelationshipPanel from "../components/RelationshipPanel.jsx";

const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function blockWindow() {
  const from = todayInputValue();
  const end = new Date(`${from}T00:00:00`);
  end.setDate(end.getDate() + 180);
  return { from, to: end.toISOString().slice(0, 10) };
}

function emptyScheduleForm(professionalId = "") {
  return { professionalId, dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true };
}

function emptyBlockForm() {
  return { professionalId: "", date: todayInputValue(), allDay: true, startTime: "09:00", endTime: "10:00", reason: "" };
}

// ─── Telas de estado (fundo escuro, card centralizado) ──────────────────────

function AdminScreenHeader() {
  return (
    <div className="admin-screen-header">
      <div className="admin-screen-brand">{tenant.name}</div>
      <span className="admin-screen-badge">Painel</span>
    </div>
  );
}

function AdminScreen({ children }) {
  return (
    <div className="admin-screen">
      <div className="admin-screen-card">{children}</div>
    </div>
  );
}

function LoginScreen({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoginError("");
    setSubmitting(true);
    try {
      await api.adminLogin(email.trim(), password);
      onSuccess();
    } catch (err) {
      setLoginError(err.message || "Credenciais inválidas");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Painel administrativo</h2>
      <p className="admin-screen-hint">
        Área restrita para gerenciamento dos agendamentos.
      </p>
      {loginError && (
        <p className="admin-screen-error" role="alert">{loginError}</p>
      )}
      <form onSubmit={handleSubmit}>
        <label className="admin-screen-label" htmlFor="admin-email">
          E-mail
          <div className="admin-screen-input-wrap">
            <svg className="admin-screen-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M4 6.5 10 11l6-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              id="admin-email"
              className="admin-screen-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
              autoComplete="username"
              placeholder="voce@empresa.com"
            />
          </div>
        </label>
        <label className="admin-screen-label" htmlFor="admin-password">
          Senha de acesso
          <div className="admin-screen-input-wrap">
            <svg className="admin-screen-input-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              id="admin-password"
              className="admin-screen-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
        </label>
        <button className="admin-screen-btn" type="submit" disabled={submitting}>
          {submitting ? (
            <span className="admin-screen-btn-loading">
              <span className="admin-screen-spinner" />
              Entrando…
            </span>
          ) : "Entrar"}
        </button>
      </form>
    </AdminScreen>
  );
}

function ForeignTenantScreen({ tenantId, onLogout }) {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Painel incorreto</h2>
      <p className="admin-screen-message">
        Sua sessão pertence a outro negócio. Acesse o painel correto para
        continuar.
      </p>
      <a className="admin-screen-btn" href={`/${tenantId}/admin`}>
        Ir para o painel correto
      </a>
      <button
        className="admin-screen-btn"
        type="button"
        onClick={onLogout}
        style={{ marginTop: 8, background: "none", border: "1px solid var(--border-light)" }}
      >
        Sair desta sessão
      </button>
    </AdminScreen>
  );
}

function LoadingScreen() {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <div className="admin-screen-loading-body">
        <span className="admin-screen-spinner admin-screen-spinner--lg" />
        <p className="admin-screen-message">Carregando painel…</p>
      </div>
    </AdminScreen>
  );
}

function UnavailableScreen({ onRetry }) {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Painel indisponível</h2>
      <p className="admin-screen-message">
        O painel administrativo está temporariamente indisponível.<br />
        Tente novamente em instantes.
      </p>
      <button className="admin-screen-btn" type="button" onClick={onRetry}>
        Tentar novamente
      </button>
    </AdminScreen>
  );
}

function ErrorScreen({ message, onRetry }) {
  return (
    <AdminScreen>
      <AdminScreenHeader />
      <div className="admin-screen-divider" />
      <h2 className="admin-screen-title">Erro ao carregar</h2>
      <p className="admin-screen-message">{message}</p>
      <button className="admin-screen-btn" type="button" onClick={onRetry}>
        Tentar novamente
      </button>
    </AdminScreen>
  );
}

// ─── Dashboard principal ─────────────────────────────────────────────────────

export default function Admin({ services, professionals }) {
  const [status, setStatus] = useState("loading");
  const [appointments, setAppointments] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [foreignTenant, setForeignTenant] = useState(null);
  const [statusChangeError, setStatusChangeError] = useState("");
  const [statusChangeSuccess, setStatusChangeSuccess] = useState("");
  const [historyByAppointment, setHistoryByAppointment] = useState({});
  const [historyLoadingId, setHistoryLoadingId] = useState(null);
  const [dateFilter, setDateFilter] = useState("");
  const [schedules, setSchedules] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [settingsError, setSettingsError] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm());
  const [blockForm, setBlockForm] = useState(emptyBlockForm());

  const safeAppointments = Array.isArray(appointments) ? appointments : [];
  const safeServices = Array.isArray(services) ? services : [];
  const safeProfessionals = Array.isArray(professionals) ? professionals : [];
  const safeSchedules = Array.isArray(schedules) ? schedules : [];
  const safeBlocks = Array.isArray(blocks) ? blocks : [];

  // Todos os hooks ANTES de qualquer early return
  const metrics = useMemo(() => {
    const today = todayInputValue();
    const weekLimit = new Date();
    weekLimit.setDate(weekLimit.getDate() + 7);

    const todayTotal = safeAppointments.filter(
      (a) => a.date.slice(0, 10) === today
    ).length;

    const weekTotal = safeAppointments.filter((a) => {
      const date = new Date(a.date);
      return date >= new Date(`${today}T00:00:00`) && date <= weekLimit;
    }).length;

    const byStatus = safeAppointments.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {});

    return { todayTotal, weekTotal, byStatus };
  }, [safeAppointments]);

  const nextAppointments = safeAppointments
    .filter((a) => a.status !== "CANCELLED")
    .slice(0, 5);

  const filteredAppointments = dateFilter
    ? safeAppointments.filter((a) => a.date.slice(0, 10) === dateFilter)
    : safeAppointments;

  function loadAppointments() {
    setStatus("loading");
    setErrorMsg("");
    setStatusChangeError("");
    setSettingsError("");
    const { from, to } = blockWindow();
    Promise.all([
      api.getAppointments(),
      api.getProfessionalSchedules(),
      api.getScheduleBlocks(from, to)
    ])
      .then(([appointmentData, scheduleData, blockData]) => {
        setAppointments(Array.isArray(appointmentData) ? appointmentData : []);
        setSchedules(Array.isArray(scheduleData) ? scheduleData : []);
        setBlocks(Array.isArray(blockData) ? blockData : []);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (err.status === 401) {
          setAppointments([]);
          setStatus("unauthenticated");
        } else if (!err.status || err.status >= 500) {
          setStatus("unavailable");
        } else {
          setErrorMsg(err.message || "Erro ao carregar agendamentos");
          setStatus("error");
        }
      });
  }

  // Confirma a sessão e o tenant antes de carregar dados. O tenant vem da
  // sessão; se não bater com a vertical desta rota, não troca silenciosamente.
  function bootstrap() {
    setStatus("loading");
    setForeignTenant(null);
    api.adminMe()
      .then((me) => {
        if (me.tenantId !== tenant.slug) {
          setForeignTenant(me.tenantId);
          setStatus("foreign");
        } else {
          loadAppointments();
        }
      })
      .catch((err) => {
        if (err.status === 401) {
          setStatus("unauthenticated");
        } else {
          setStatus("unavailable");
        }
      });
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!scheduleForm.professionalId && safeProfessionals.length) {
      setScheduleForm((current) => ({ ...current, professionalId: String(safeProfessionals[0].id) }));
    }
  }, [professionals, scheduleForm.professionalId]);

  async function handleStatusChange(id, newStatus, reason) {
    setStatusChangeError("");
    setStatusChangeSuccess("");
    try {
      const updated = await api.updateAppointmentStatus(id, newStatus, reason);
      setAppointments((current) => current.map((appointment) =>
        appointment.id === id ? updated : appointment
      ));
      setHistoryByAppointment((current) => ({ ...current, [id]: undefined }));
      setStatusChangeSuccess("Status atualizado com sucesso.");
    } catch (err) {
      setStatusChangeError(err.message);
    }
  }

  async function handleViewHistory(id) {
    if (historyByAppointment[id]) {
      setHistoryByAppointment((current) => ({ ...current, [id]: undefined }));
      return;
    }
    setStatusChangeError("");
    setHistoryLoadingId(id);
    try {
      const history = await api.getAppointmentHistory(id);
      setHistoryByAppointment((current) => ({ ...current, [id]: history }));
    } catch (err) {
      setStatusChangeError(err.message);
    } finally {
      setHistoryLoadingId(null);
    }
  }

  function handleLogout() {
    api.adminLogout()
      .finally(() => {
        setAppointments([]);
        setStatus("unauthenticated");
      });
  }

  async function handleScheduleSubmit(event) {
    event.preventDefault();
    setSettingsError("");
    const payload = {
      ...scheduleForm,
      professionalId: Number(scheduleForm.professionalId),
      dayOfWeek: Number(scheduleForm.dayOfWeek)
    };
    try {
      if (editingScheduleId) {
        await api.updateProfessionalSchedule(editingScheduleId, payload);
      } else {
        await api.createProfessionalSchedule(payload);
      }
      setEditingScheduleId(null);
      setScheduleForm(emptyScheduleForm(scheduleForm.professionalId));
      loadAppointments();
    } catch (error) {
      setSettingsError(error.message);
    }
  }

  function editSchedule(schedule) {
    setEditingScheduleId(schedule.id);
    setScheduleForm({
      professionalId: String(schedule.professionalId),
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      active: schedule.active
    });
  }

  async function removeSchedule(id) {
    setSettingsError("");
    try {
      await api.deleteProfessionalSchedule(id);
      loadAppointments();
    } catch (error) {
      setSettingsError(error.message);
    }
  }

  async function handleBlockSubmit(event) {
    event.preventDefault();
    setSettingsError("");
    const payload = {
      professionalId: blockForm.professionalId ? Number(blockForm.professionalId) : null,
      date: blockForm.date,
      allDay: blockForm.allDay,
      startTime: blockForm.allDay ? null : blockForm.startTime,
      endTime: blockForm.allDay ? null : blockForm.endTime,
      reason: blockForm.reason
    };
    try {
      await api.createScheduleBlock(payload);
      setBlockForm(emptyBlockForm());
      loadAppointments();
    } catch (error) {
      setSettingsError(error.message);
    }
  }

  async function removeBlock(id) {
    setSettingsError("");
    try {
      await api.deleteScheduleBlock(id);
      loadAppointments();
    } catch (error) {
      setSettingsError(error.message);
    }
  }

  // ─── Estados de tela completa ──────────────────────────────────────────────
  if (status === "loading") return <LoadingScreen />;
  if (status === "unauthenticated") return <LoginScreen onSuccess={bootstrap} />;
  if (status === "foreign") return <ForeignTenantScreen tenantId={foreignTenant} onLogout={handleLogout} />;
  if (status === "unavailable") return <UnavailableScreen onRetry={bootstrap} />;
  if (status === "error") return <ErrorScreen message={errorMsg} onRetry={loadAppointments} />;

  // ─── Dashboard (só renderiza quando authenticated) ─────────────────────────
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-header-brand">
          <strong>{tenant.name}</strong>
          <span>· Painel administrativo</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: "none",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 12px",
              fontSize: "0.8rem",
              color: "var(--text-on-light-muted)",
              cursor: "pointer"
            }}
          >
            Sair
          </button>
        </div>
      </header>

      <section className="section">
        {statusChangeError && (
          <StateMessage type="error" title="Erro ao alterar status">
            {statusChangeError}
          </StateMessage>
        )}
        {statusChangeSuccess && (
          <StateMessage type="success" title="Alteração concluída">
            {statusChangeSuccess}
          </StateMessage>
        )}
        {settingsError && (
          <StateMessage type="error" title="Erro na agenda">
            {settingsError}
          </StateMessage>
        )}

        <div className="metrics-grid">
          <article>
            <span className="metric-label">Hoje</span>
            <strong className="metric-value accent">{metrics.todayTotal}</strong>
          </article>
          <article>
            <span className="metric-label">Confirmados</span>
            <strong className="metric-value success">{metrics.byStatus.CONFIRMED || 0}</strong>
          </article>
          <article>
            <span className="metric-label">Pendentes</span>
            <strong className="metric-value warning">{metrics.byStatus.PENDING || 0}</strong>
          </article>
          <article>
            <span className="metric-label">Próximos 7 dias</span>
            <strong className="metric-value neutral">{metrics.weekTotal}</strong>
          </article>
        </div>

        <RelationshipPanel appointments={safeAppointments} services={safeServices} professionals={safeProfessionals} />

        <div className="admin-grid">
          <section className="panel">
            <h2>Próximos agendamentos</h2>
            {nextAppointments.length === 0 && (
              <StateMessage title="Nenhum próximo agendamento" />
            )}
            <div className="stack">
              {nextAppointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  onStatusChange={handleStatusChange}
                  onViewHistory={handleViewHistory}
                  history={historyByAppointment[a.id]}
                  historyLoading={historyLoadingId === a.id}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Serviços</h2>
            {safeServices.length === 0 && (
              <StateMessage title="Carregando serviços…" />
            )}
            <div className="stack">
              {safeServices.map((s) => (
                <div className="compact-row" key={s.id}>
                  <strong>{s.name}</strong>
                  <span>{formatCurrency(s.price)} · {s.duration} min</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="admin-grid">
          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0 }}>Todos os agendamentos</h2>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  style={{ fontSize: "0.8rem", padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "transparent", color: "inherit", cursor: "pointer" }}
                />
                {dateFilter && (
                  <button
                    type="button"
                    onClick={() => setDateFilter("")}
                    style={{ fontSize: "0.8rem", padding: "4px 8px", background: "none", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "inherit" }}
                  >
                    Limpar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.open(api.getExportUrl(), "_blank")}
                  style={{ fontSize: "0.8rem", padding: "4px 8px", background: "none", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "inherit" }}
                >
                  CSV ↓
                </button>
              </div>
            </div>
            {filteredAppointments.length === 0 && (
              <StateMessage title={dateFilter ? "Nenhum agendamento nesta data" : "Nenhum agendamento cadastrado"} />
            )}
            <div className="stack">
              {filteredAppointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  onStatusChange={handleStatusChange}
                  onViewHistory={handleViewHistory}
                  history={historyByAppointment[a.id]}
                  historyLoading={historyLoadingId === a.id}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Profissionais</h2>
            {safeProfessionals.length === 0 && (
              <StateMessage title="Carregando profissionais…" />
            )}
            <div className="stack">
              {safeProfessionals.map((p) => (
                <div className="compact-row" key={p.id}>
                  <strong>{p.name}</strong>
                  <span>{p.specialty}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="admin-grid admin-grid-settings">
          <section className="panel">
            <h2>Horários por profissional</h2>
            <form className="admin-form-grid" onSubmit={handleScheduleSubmit}>
              <label>
                Profissional
                <select
                  value={scheduleForm.professionalId}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, professionalId: event.target.value })}
                  required
                >
                  {safeProfessionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>{professional.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Dia
                <select
                  value={scheduleForm.dayOfWeek}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, dayOfWeek: Number(event.target.value) })}
                >
                  {weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </label>
              <label>
                Início
                <input
                  type="time"
                  value={scheduleForm.startTime}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, startTime: event.target.value })}
                  required
                />
              </label>
              <label>
                Fim
                <input
                  type="time"
                  value={scheduleForm.endTime}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, endTime: event.target.value })}
                  required
                />
              </label>
              <label className="admin-check-field">
                <input
                  type="checkbox"
                  checked={scheduleForm.active}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, active: event.target.checked })}
                />
                Intervalo ativo
              </label>
              <div className="admin-form-actions">
                <button className="admin-action-primary" type="submit">
                  {editingScheduleId ? "Salvar horário" : "Adicionar horário"}
                </button>
                {editingScheduleId && (
                  <button
                    className="admin-action-secondary"
                    type="button"
                    onClick={() => {
                      setEditingScheduleId(null);
                      setScheduleForm(emptyScheduleForm(scheduleForm.professionalId));
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
            <div className="stack admin-settings-list">
              {safeSchedules
                .filter((schedule) => String(schedule.professionalId) === String(scheduleForm.professionalId))
                .map((schedule) => (
                  <div className="admin-settings-row" key={schedule.id}>
                    <div>
                      <strong>{weekDays[schedule.dayOfWeek]}</strong>
                      <span>{schedule.startTime}–{schedule.endTime}{schedule.active ? "" : " · inativo"}</span>
                    </div>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => editSchedule(schedule)}>Editar</button>
                      <button type="button" onClick={() => removeSchedule(schedule.id)}>Remover</button>
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <section className="panel">
            <h2>Bloqueios</h2>
            <form className="admin-form-grid" onSubmit={handleBlockSubmit}>
              <label>
                Data
                <input
                  type="date"
                  value={blockForm.date}
                  onChange={(event) => setBlockForm({ ...blockForm, date: event.target.value })}
                  required
                />
              </label>
              <label>
                Aplicar a
                <select
                  value={blockForm.professionalId}
                  onChange={(event) => setBlockForm({ ...blockForm, professionalId: event.target.value })}
                >
                  <option value="">Todo o negócio</option>
                  {safeProfessionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>{professional.name}</option>
                  ))}
                </select>
              </label>
              <label className="admin-check-field">
                <input
                  type="checkbox"
                  checked={blockForm.allDay}
                  onChange={(event) => setBlockForm({ ...blockForm, allDay: event.target.checked })}
                />
                Dia inteiro
              </label>
              {!blockForm.allDay && (
                <>
                  <label>
                    Início
                    <input
                      type="time"
                      value={blockForm.startTime}
                      onChange={(event) => setBlockForm({ ...blockForm, startTime: event.target.value })}
                      required
                    />
                  </label>
                  <label>
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
              <label className="admin-form-wide">
                Motivo opcional
                <input
                  type="text"
                  maxLength="200"
                  value={blockForm.reason}
                  onChange={(event) => setBlockForm({ ...blockForm, reason: event.target.value })}
                />
              </label>
              <div className="admin-form-actions">
                <button className="admin-action-primary" type="submit">Criar bloqueio</button>
              </div>
            </form>
            <div className="stack admin-settings-list">
              {safeBlocks.map((block) => (
                <div className="admin-settings-row" key={block.id}>
                  <div>
                    <strong>{block.date.slice(0, 10)} · {block.professional?.name || "Todo o negócio"}</strong>
                    <span>
                      {block.allDay ? "Dia inteiro" : `${block.startTime}–${block.endTime}`}
                      {block.reason ? ` · ${block.reason}` : ""}
                    </span>
                  </div>
                  <div className="admin-row-actions">
                    <button type="button" onClick={() => removeBlock(block.id)}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
