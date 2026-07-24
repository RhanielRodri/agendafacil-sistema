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
import RowActions from "../../components/panel/RowActions.jsx";
import { formatMinutes, pageInfo, pageItems } from "../../utils/panel.js";

function emptyForm() {
  return { name: "", specialty: "", photo: "", internalContact: "" };
}

function toForm(professional) {
  return {
    name: professional.name,
    specialty: professional.specialty || "",
    photo: professional.photo || "",
    internalContact: professional.internalContact || ""
  };
}

export default function Professionals({ vertical, services, onNavigate, onSessionExpired, onCatalogChange }) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [linking, setLinking] = useState(null);
  const [dependencies, setDependencies] = useState(null);

  const { state, data, error, reload } = usePanelData(
    () => api.getAdminProfessionals({ search, active: activeFilter, page, limit: 20 }),
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

  async function submit(event) {
    event.preventDefault();
    const payload = {
      name: form.name,
      specialty: form.specialty,
      photo: form.photo,
      internalContact: form.internalContact
    };
    const ok = await action.run(
      () => (editing === "new"
        ? api.createAdminProfessional(payload)
        : api.updateAdminProfessional(editing, payload)),
      editing === "new" ? `${vertical.professionalNoun} criado.` : `${vertical.professionalNoun} atualizado.`
    );
    if (ok) setEditing(null);
  }

  async function saveLinks() {
    const ok = await action.run(
      () => api.setProfessionalServices(linking.id, linking.serviceIds),
      `${vertical.servicePlural} associados atualizados.`
    );
    if (ok) setLinking(null);
  }

  async function openDependencies(professional) {
    try {
      setDependencies({ name: professional.name, loading: true });
      const result = await api.getProfessionalDependencies(professional.id);
      setDependencies({ ...result, name: professional.name, loading: false });
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      action.setMessage({ type: "error", text: failure.message });
      setDependencies(null);
    }
  }

  function move(index, direction) {
    const order = items.map((professional) => professional.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    action.run(() => api.reorderAdminProfessionals(order), "Ordem atualizada.");
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
        <label className="sr-only" htmlFor="professional-search">Buscar {vertical.professionalPlural.toLowerCase()}</label>
        <input
          id="professional-search"
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder={`Buscar ${vertical.professionalPlural.toLowerCase()}`}
          style={{ flex: "1 1 200px" }}
        />
        <button className="panel-btn" type="submit">Buscar</button>
        <label className="panel-field">
          Situação
          <select value={activeFilter} onChange={(event) => { setPage(1); setActiveFilter(event.target.value); }}>
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </label>
        <span className="panel-toolbar-spacer" />
        <button className="panel-btn" type="button" onClick={reload}>Atualizar</button>
        <button
          className="panel-btn-primary"
          type="button"
          onClick={() => { setEditing("new"); setForm(emptyForm()); }}
        >
          Novo {vertical.professionalNoun.toLowerCase()}
        </button>
      </form>

      {editing !== null && (
        <section className="panel-block">
          <div className="panel-block-head">
            <h2>{editing === "new" ? `Novo ${vertical.professionalNoun.toLowerCase()}` : `Editar ${vertical.professionalNoun.toLowerCase()}`}</h2>
            <p>Contato interno não aparece em nenhuma página pública</p>
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
            <label className="panel-field">
              Especialidade
              <input
                type="text"
                maxLength="120"
                value={form.specialty}
                onChange={(event) => setForm({ ...form, specialty: event.target.value })}
              />
            </label>
            <label className="panel-field">
              Contato interno
              <input
                type="text"
                maxLength="60"
                value={form.internalContact}
                onChange={(event) => setForm({ ...form, internalContact: event.target.value })}
              />
            </label>
            <label className="panel-field" style={{ gridColumn: "span 2" }}>
              Foto (URL)
              <input
                type="text"
                maxLength="300"
                value={form.photo}
                onChange={(event) => setForm({ ...form, photo: event.target.value })}
              />
            </label>
            <div className="panel-form-actions">
              <button className="panel-btn-primary" type="submit" disabled={action.busy}>
                {editing === "new" ? "Criar" : "Salvar"}
              </button>
              <button className="panel-btn" type="button" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      {linking && (
        <section className="panel-block">
          <div className="panel-block-head">
            <h2>{vertical.servicePlural} de {linking.name}</h2>
            <p>Só {vertical.servicePlural.toLowerCase()} deste negócio aparecem aqui</p>
          </div>
          <div className="panel-checklist">
            {services.length === 0 && <p>Nenhum serviço cadastrado ainda.</p>}
            {services.map((service) => (
              <label key={service.id}>
                <input
                  type="checkbox"
                  checked={linking.serviceIds.includes(service.id)}
                  onChange={(event) => setLinking({
                    ...linking,
                    serviceIds: event.target.checked
                      ? [...linking.serviceIds, service.id]
                      : linking.serviceIds.filter((id) => id !== service.id)
                  })}
                />
                <span>{service.name}{service.active ? "" : " (inativo)"}</span>
              </label>
            ))}
          </div>
          <div className="panel-form-actions">
            <button className="panel-btn-primary" type="button" onClick={saveLinks} disabled={action.busy}>
              Salvar associação
            </button>
            <button className="panel-btn" type="button" onClick={() => setLinking(null)}>Cancelar</button>
          </div>
        </section>
      )}

      {state === "loading" && !data && <PanelLoading rows={4} label="Carregando profissionais…" />}
      {state === "error" && <PanelError onRetry={reload}>{error}</PanelError>}

      {data && (items.length === 0 ? (
        <PanelEmpty
          title={search || activeFilter ? "Sem resultados" : `Nenhum ${vertical.professionalNoun.toLowerCase()} cadastrado`}
          actionLabel={search || activeFilter ? "Limpar filtros" : undefined}
          onAction={search || activeFilter
            ? () => { setSearchDraft(""); setSearch(""); setActiveFilter(""); setPage(1); }
            : undefined}
        >
          {search || activeFilter
            ? "Nenhum registro corresponde a esses filtros."
            : "Cadastre a equipe para liberar agenda e agendamento público."}
        </PanelEmpty>
      ) : (
        <>
          <div className="panel-list">
            <div className="panel-list-head" aria-hidden="true">
              <span>Ordem</span>
              <span>{vertical.professionalNoun}</span>
              <span>{vertical.servicePlural}</span>
              <span>Carga semanal</span>
              <span>Situação</span>
              <span />
            </div>
            {items.map((professional, index) => (
              <div className={`panel-row${professional.active ? "" : " panel-row--muted"}`} key={professional.id}>
                <div className="panel-row-time">{(pagination.page - 1) * pagination.limit + index + 1}º</div>
                <div className="panel-row-main">
                  <strong>{professional.name}</strong>
                  <span>{professional.specialty || "Sem especialidade registrada"}</span>
                </div>
                <div className="panel-row-cell">
                  <strong>
                    {professional.serviceNames.length}{" "}
                    {(professional.serviceNames.length === 1 ? vertical.serviceNoun : vertical.servicePlural).toLowerCase()}
                  </strong>
                  <span>{professional.serviceNames.slice(0, 3).join(", ") || "Nenhum associado"}</span>
                </div>
                <div className="panel-row-cell">
                  <strong>{formatMinutes(professional.weeklyMinutes)} por semana</strong>
                  <span>{professional.upcomingAppointments} agendamento(s) futuro(s)</span>
                </div>
                <div className="panel-row-status">
                  <span className={`panel-status ${professional.active ? "confirmed" : "cancelled"}`}>
                    {professional.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <RowActions
                  primary={[
                    { key: "up", label: "↑", ariaLabel: "Subir na ordem", disabled: index === 0, onClick: () => move(index, -1) },
                    { key: "down", label: "↓", ariaLabel: "Descer na ordem", disabled: index === items.length - 1, onClick: () => move(index, 1) },
                    { key: "edit", label: "Editar", onClick: () => { setEditing(professional.id); setForm(toForm(professional)); } }
                  ]}
                  secondary={[
                    {
                      key: "services",
                      label: vertical.servicePlural,
                      onClick: () => setLinking({ id: professional.id, name: professional.name, serviceIds: [...professional.serviceIds] })
                    },
                    {
                      key: "agenda",
                      label: "Agenda",
                      onClick: () => onNavigate("disponibilidade", { professionalId: professional.id })
                    },
                    {
                      key: "toggle",
                      label: professional.active ? "Inativar" : "Reativar",
                      onClick: () => action.run(
                        (confirm) => api.setAdminProfessionalActive(professional.id, !professional.active, confirm),
                        professional.active ? "Profissional inativado." : "Profissional reativado."
                      )
                    },
                    { key: "deps", label: "Dependências", onClick: () => openDependencies(professional) }
                  ]}
                />
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
            <p>Histórico permanece mesmo depois da inativação</p>
          </div>
          {dependencies.loading ? <PanelLoading rows={2} label="Carregando dependências…" /> : (
            <>
              <div className="panel-detail-facts">
                <div><span>Agendamentos futuros</span><strong>{dependencies.upcomingAppointments}</strong></div>
                <div><span>Agendamentos no histórico</span><strong>{dependencies.totalAppointments}</strong></div>
                <div><span>Janelas de agenda</span><strong>{dependencies.schedules}</strong></div>
                <div><span>Bloqueios</span><strong>{dependencies.blocks}</strong></div>
                <div><span>{vertical.servicePlural} associados</span><strong>{dependencies.linkedServices}</strong></div>
                <div><span>Leads ativos</span><strong>{dependencies.activeLeads}</strong></div>
              </div>
              <div className="panel-form-actions">
                <button className="panel-btn" type="button" onClick={() => setDependencies(null)}>Fechar</button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
