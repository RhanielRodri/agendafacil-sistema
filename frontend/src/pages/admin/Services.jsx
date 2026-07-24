import React, { useState } from "react";
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
import { formatMinutes, pageInfo, pageItems } from "../../utils/panel.js";
import { formatCurrency } from "../../utils/format.js";

function emptyForm() {
  return { name: "", description: "", duration: 30, price: "", hasPrice: false, requiresEvaluation: false };
}

function toForm(service) {
  return {
    name: service.name,
    description: service.description || "",
    duration: service.duration,
    price: service.price === null ? "" : String(service.price),
    hasPrice: service.price !== null,
    requiresEvaluation: service.requiresEvaluation
  };
}

export default function Services({ vertical, onNavigate, onSessionExpired, onCatalogChange }) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [dependencies, setDependencies] = useState(null);

  const { state, data, error, reload } = usePanelData(
    () => api.getAdminServices({ search, active: activeFilter, page, limit: 20 }),
    [search, activeFilter, page],
    onSessionExpired
  );

  const action = useStructuralAction({
    onSessionExpired,
    reload: async () => {
      await reload();
      onCatalogChange?.();
    }
  });

  const items = pageItems(data);
  const pagination = pageInfo(data);

  function startCreate() {
    setEditing("new");
    setForm(emptyForm());
    setDependencies(null);
  }

  function startEdit(service) {
    setEditing(service.id);
    setForm(toForm(service));
    setDependencies(null);
  }

  function payload() {
    return {
      name: form.name,
      description: form.description,
      duration: Number(form.duration),
      price: form.hasPrice ? Number(form.price || 0) : null,
      requiresEvaluation: form.requiresEvaluation
    };
  }

  async function submit(event) {
    event.preventDefault();
    const ok = await action.run(
      (confirm) => (editing === "new"
        ? api.createAdminService(payload())
        : api.updateAdminService(editing, { ...payload(), confirm })),
      editing === "new" ? `${vertical.serviceNoun} criado.` : `${vertical.serviceNoun} atualizado.`
    );
    if (ok) setEditing(null);
  }

  async function openDependencies(service) {
    try {
      setDependencies({ serviceId: service.id, name: service.name, loading: true });
      const result = await api.getServiceDependencies(service.id);
      setDependencies({ ...result, name: service.name, loading: false });
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      action.setMessage({ type: "error", text: failure.message });
      setDependencies(null);
    }
  }

  function move(index, direction) {
    const order = items.map((service) => service.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    action.run(() => api.reorderAdminServices(order), "Ordem atualizada.");
  }

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

      <form
        className="panel-toolbar"
        onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); }}
      >
        <label className="sr-only" htmlFor="service-search">Buscar {vertical.servicePlural.toLowerCase()}</label>
        <input
          id="service-search"
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder={`Buscar ${vertical.servicePlural.toLowerCase()}`}
          style={{ flex: "1 1 200px" }}
        />
        <button className="panel-btn" type="submit">Buscar</button>
        <label className="panel-field">
          Situação
          <select
            value={activeFilter}
            onChange={(event) => { setPage(1); setActiveFilter(event.target.value); }}
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </label>
        <span className="panel-toolbar-spacer" />
        <button className="panel-btn" type="button" onClick={reload}>Atualizar</button>
        <button className="panel-btn-primary" type="button" onClick={startCreate}>
          Novo {vertical.serviceNoun.toLowerCase()}
        </button>
      </form>

      {editing !== null && (
        <section className="panel-block">
          <div className="panel-block-head">
            <h2>{editing === "new" ? `Novo ${vertical.serviceNoun.toLowerCase()}` : `Editar ${vertical.serviceNoun.toLowerCase()}`}</h2>
            <p>Duração e preço alimentam a agenda e a página pública</p>
          </div>
          <form className="panel-form-grid" onSubmit={submit}>
            <label className="panel-field">
              Nome
              <input
                type="text"
                maxLength="80"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                autoFocus
              />
            </label>
            <label className="panel-field" style={{ gridColumn: "span 2" }}>
              Descrição curta
              <input
                type="text"
                maxLength="240"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
            <label className="panel-field">
              Duração (min)
              <input
                type="number"
                min="5"
                max="480"
                step="5"
                value={form.duration}
                onChange={(event) => setForm({ ...form, duration: event.target.value })}
                required
              />
            </label>
            <label className="panel-field">
              <span>
                <input
                  type="checkbox"
                  checked={form.hasPrice}
                  onChange={(event) => setForm({ ...form, hasPrice: event.target.checked })}
                /> Informar preço
              </span>
            </label>
            {form.hasPrice && (
              <label className="panel-field">
                Preço (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm({ ...form, price: event.target.value })}
                />
              </label>
            )}
            {vertical.showEvaluationFlag && (
              <label className="panel-field">
                <span>
                  <input
                    type="checkbox"
                    checked={form.requiresEvaluation}
                    onChange={(event) => setForm({ ...form, requiresEvaluation: event.target.checked })}
                  /> Exige avaliação prévia
                </span>
              </label>
            )}
            <div className="panel-form-actions">
              <button className="panel-btn-primary" type="submit" disabled={action.busy}>
                {editing === "new" ? "Criar" : "Salvar"}
              </button>
              <button className="panel-btn" type="button" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      {state === "loading" && !data && <PanelLoading rows={4} label={`Carregando ${vertical.servicePlural.toLowerCase()}…`} />}
      {state === "error" && <PanelError onRetry={reload}>{error}</PanelError>}

      {data && (items.length === 0 ? (
        <PanelEmpty
          title={search || activeFilter ? "Sem resultados" : `Nenhum ${vertical.serviceNoun.toLowerCase()} cadastrado`}
          actionLabel={search || activeFilter ? "Limpar filtros" : `Criar ${vertical.serviceNoun.toLowerCase()}`}
          onAction={search || activeFilter
            ? () => { setSearchDraft(""); setSearch(""); setActiveFilter(""); setPage(1); }
            : startCreate}
        >
          {search || activeFilter
            ? "Nenhum registro corresponde a esses filtros."
            : "A página pública e o agendamento usam esta lista."}
        </PanelEmpty>
      ) : (
        <>
          <div className="panel-list">
            <div className="panel-list-head" aria-hidden="true">
              <span>Duração</span>
              <span>{vertical.serviceNoun}</span>
              <span>Preço</span>
              <span>Uso</span>
              <span>Situação</span>
              <span />
            </div>
            {items.map((service, index) => (
              <div className={`panel-row${service.active ? "" : " panel-row--muted"}`} key={service.id}>
                <div className="panel-row-time">{formatMinutes(service.duration)}</div>
                <div className="panel-row-main">
                  <strong>{service.name}</strong>
                  <span>{service.description || "Sem descrição"}</span>
                </div>
                <div className="panel-row-cell">
                  <strong>{service.price === null ? "Preço não informado" : formatCurrency(service.price)}</strong>
                  <span>{service.requiresEvaluation ? "Exige avaliação prévia" : "Agendamento direto"}</span>
                </div>
                <div className="panel-row-cell">
                  <strong>{service.professionalCount} profissional(is)</strong>
                  <span>{service.upcomingAppointments} agendamento(s) futuro(s)</span>
                </div>
                <div className="panel-row-status">
                  <span className={`panel-status ${service.active ? "confirmed" : "cancelled"}`}>
                    {service.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div className="panel-row-actions">
                  <button className="panel-btn" type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir na ordem">↑</button>
                  <button className="panel-btn" type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Descer na ordem">↓</button>
                  <button className="panel-btn" type="button" onClick={() => startEdit(service)}>Editar</button>
                  <button
                    className="panel-btn"
                    type="button"
                    onClick={() => action.run(
                      (confirm) => api.setAdminServiceActive(service.id, !service.active, confirm),
                      `${vertical.serviceNoun} ${service.active ? "inativado" : "reativado"}.`
                    )}
                  >
                    {service.active ? "Inativar" : "Reativar"}
                  </button>
                  <button className="panel-btn-link" type="button" onClick={() => openDependencies(service)}>
                    Dependências
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="panel-pagination">
            <button className="panel-btn" type="button" disabled={pagination.page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>Página {pagination.page} de {pagination.pages} · {pagination.total} registro(s)</span>
            <button
              className="panel-btn"
              type="button"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      ))}

      {dependencies && (
        <section className="panel-block">
          <div className="panel-block-head">
            <h2>Dependências de {dependencies.name}</h2>
            <p>Nada é apagado automaticamente — com histórico, a saída é inativar</p>
          </div>
          {dependencies.loading ? <PanelLoading rows={2} label="Carregando dependências…" /> : (
            <>
              <div className="panel-detail-facts">
                <div><span>Agendamentos futuros</span><strong>{dependencies.upcomingAppointments}</strong></div>
                <div><span>Agendamentos no histórico</span><strong>{dependencies.totalAppointments}</strong></div>
                <div><span>Profissionais associados</span><strong>{dependencies.linkedProfessionals}</strong></div>
                <div><span>Leads ativos</span><strong>{dependencies.activeLeads}</strong></div>
                <div><span>Exclusão</span><strong>{dependencies.removable ? "Sem vínculos" : "Bloqueada por histórico"}</strong></div>
              </div>
              <div className="panel-form-actions">
                <button className="panel-btn" type="button" onClick={() => onNavigate("agenda")}>Abrir agenda</button>
                <button className="panel-btn" type="button" onClick={() => setDependencies(null)}>Fechar</button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
