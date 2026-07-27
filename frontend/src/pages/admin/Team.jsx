import React, { useEffect, useRef, useState } from "react";
import { api } from "../../services/api.js";
import { PanelEmpty, PanelError, PanelLoading, PanelMessage } from "../../components/panel/PanelState.jsx";
import RowActions from "../../components/panel/RowActions.jsx";
import { usePanelData } from "../../utils/usePanelData.js";
import {
  permissionLabels,
  roleDefaults,
  roleLabels
} from "../../utils/adminRbac.js";

const permissionGroups = [
  {
    label: "Atendimento",
    permissions: ["overview", "agenda", "clients"]
  },
  {
    label: "Relacionamento",
    permissions: ["leads", "follow_ups"]
  },
  {
    label: "Operação",
    permissions: ["services", "professionals", "scheduling"]
  },
  {
    label: "Gestão",
    permissions: ["metrics", "settings", "team"]
  }
];

const auditActionLabels = {
  MEMBERSHIP_CREATED: "Acesso criado",
  ROLE_CHANGED: "Role ou vínculo alterado",
  PERMISSIONS_CHANGED: "Permissões alteradas",
  ACTIVATED: "Acesso ativado",
  DEACTIVATED: "Acesso desativado"
};

function emptyForm() {
  return {
    id: null,
    email: "",
    name: "",
    role: "receptionist",
    professionalId: "",
    permissions: [...roleDefaults.receptionist]
  };
}

function formFromMember(member) {
  return {
    id: member.id,
    email: member.email,
    name: member.name || "",
    role: member.role,
    professionalId: member.professionalId || "",
    permissions: [...member.permissions]
  };
}

function matchesPreset(role, permissions = []) {
  const preset = roleDefaults[role] || [];
  return preset.length === permissions.length
    && preset.every((permission) => permissions.includes(permission));
}

function permissionLocked(role, permission) {
  return role === "professional" || permission === "team";
}

function roleConstraint(role) {
  if (role === "owner") return "Owner pode personalizar os módulos; Equipe e acessos permanece obrigatório.";
  if (role === "professional") return "Profissional mantém acesso somente à própria agenda.";
  return "As permissões podem ser ajustadas individualmente pelo owner.";
}

function accessDate(value) {
  if (!value) return "Nunca acessou";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function permissionSummary(permissions = []) {
  if (!permissions.length) return "Sem módulos";
  return permissions.map((permission) => permissionLabels[permission] || permission).join(", ");
}

function auditChange(event) {
  if (event.action === "MEMBERSHIP_CREATED") {
    return `${roleLabels[event.after.role] || event.after.role} · ${permissionSummary(event.after.permissions)}`;
  }
  if (event.action === "ACTIVATED" || event.action === "DEACTIVATED") {
    return event.after.active ? "Acesso ativo" : "Acesso inativo";
  }
  if (event.action === "PERMISSIONS_CHANGED") {
    return permissionSummary(event.after.permissions);
  }
  const role = roleLabels[event.after.role] || event.after.role;
  return event.after.professionalId ? `${role} · profissional vinculado` : role;
}

function AccessDrawer({
  form,
  professionals,
  busy,
  onChange,
  onRoleChange,
  onTogglePermission,
  onRestoreDefault,
  onClose,
  onSubmit
}) {
  const drawerRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const custom = !matchesPreset(form.role, form.permissions);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [busy, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const drawer = drawerRef.current;
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])"
    ].join(",");

    drawer?.querySelector(focusableSelector)?.focus();
    document.body.classList.add("panel-access-drawer-open");

    function handleKeyDown(event) {
      if (event.key === "Escape" && !busyRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = [...drawer.querySelectorAll(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("panel-access-drawer-open");
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div
      className="panel-access-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <aside
        className="panel-access-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-drawer-title"
      >
        <div className="panel-access-drawer-head">
          <div>
            <span className="panel-access-eyebrow">Equipe e acessos</span>
            <h2 id="access-drawer-title">{form.id ? "Editar acesso" : "Adicionar usuário"}</h2>
            <p>Defina a função e ajuste os módulos deste negócio.</p>
          </div>
          <button
            className="panel-access-drawer-close"
            type="button"
            aria-label="Fechar"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form className="panel-access-form" onSubmit={onSubmit}>
          <div className="panel-access-fields">
            <label className="panel-field">
              E-mail
              <input
                type="email"
                maxLength="254"
                value={form.email}
                onChange={(event) => onChange({ ...form, email: event.target.value })}
                disabled={Boolean(form.id)}
                required
              />
            </label>
            <label className="panel-field">
              Nome
              <input
                type="text"
                maxLength="120"
                value={form.name}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
                disabled={Boolean(form.id)}
                placeholder="Opcional"
              />
            </label>
            <label className="panel-field panel-access-role">
              Função
              <select value={form.role} onChange={(event) => onRoleChange(event.target.value)}>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            {form.role === "professional" && (
              <label className="panel-field panel-access-professional">
                Profissional vinculado
                <select
                  value={form.professionalId}
                  onChange={(event) => onChange({ ...form, professionalId: event.target.value })}
                  required
                >
                  <option value="">Selecione um profissional</option>
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>{professional.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="panel-permission-heading">
            <div>
              <div className="panel-permission-title">
                <strong>Permissões por módulo</strong>
                <span className={`panel-preset-badge${custom ? " is-custom" : ""}`}>
                  {custom ? "Personalizado" : "Padrão da função"}
                </span>
              </div>
              <p>{roleConstraint(form.role)}</p>
            </div>
            <button
              className="panel-btn"
              type="button"
              disabled={!custom || busy}
              onClick={onRestoreDefault}
            >
              Restaurar padrão
            </button>
          </div>

          <div className="panel-permission-groups">
            {permissionGroups.map((group) => (
              <section className="panel-permission-group" key={group.label}>
                <h3>{group.label}</h3>
                {group.permissions.map((permission) => {
                  const locked = permissionLocked(form.role, permission);
                  return (
                    <label
                      className={`panel-permission-switch${locked ? " is-locked" : ""}`}
                      key={permission}
                    >
                      <span>{permissionLabels[permission]}</span>
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(permission)}
                        disabled={locked}
                        onChange={() => onTogglePermission(permission)}
                      />
                      <i aria-hidden="true" />
                    </label>
                  );
                })}
              </section>
            ))}
          </div>

          <div className="panel-access-form-actions">
            <button className="panel-btn" type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button className="panel-btn-primary" type="submit" disabled={busy}>
              {busy ? "Salvando…" : form.id ? "Salvar alterações" : "Adicionar usuário"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export default function Team({ professionals, onSessionExpired }) {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [auditPage, setAuditPage] = useState(1);
  const [activeCandidate, setActiveCandidate] = useState(null);

  const team = usePanelData(
    () => api.getTeam(),
    [],
    onSessionExpired
  );
  const audit = usePanelData(
    () => api.getTeamAudit({ page: auditPage, limit: 20 }),
    [auditPage],
    onSessionExpired
  );

  const members = Array.isArray(team.data) ? team.data : [];
  const auditItems = audit.data?.items || [];
  const auditPagination = audit.data?.pagination || { page: 1, pages: 1, total: 0 };
  const availableProfessionals = professionals.filter((professional) => professional.active !== false);

  function changeRole(role) {
    setForm((current) => ({
      ...current,
      role,
      professionalId: role === "professional" ? current.professionalId : "",
      permissions: [...roleDefaults[role]]
    }));
  }

  function togglePermission(permission) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((value) => value !== permission)
        : [...current.permissions, permission]
    }));
  }

  function restoreDefaultPermissions() {
    setForm((current) => ({
      ...current,
      permissions: [...roleDefaults[current.role]]
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusyId(form.id || "new");
    setMessage(null);
    const payload = {
      role: form.role,
      professionalId: form.role === "professional" ? form.professionalId : null,
      permissions: form.permissions
    };
    try {
      if (form.id) {
        await api.updateTeamMember(form.id, payload);
        setMessage({ type: "success", text: "Acesso atualizado." });
      } else {
        await api.createTeamMember({
          email: form.email,
          name: form.name,
          ...payload
        });
        setMessage({ type: "success", text: "Usuário adicionado à equipe." });
      }
      setForm(null);
      await Promise.all([team.reload(), audit.reload()]);
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive() {
    const member = activeCandidate;
    if (!member) return;
    setBusyId(member.id);
    setMessage(null);
    try {
      await api.setTeamMemberActive(member.id, !member.membershipActive);
      setMessage({
        type: "success",
        text: member.membershipActive ? "Acesso desativado." : "Acesso ativado."
      });
      setActiveCandidate(null);
      await Promise.all([team.reload(), audit.reload()]);
    } catch (failure) {
      if (failure.status === 401) onSessionExpired?.();
      setMessage({ type: "error", text: failure.message });
      setActiveCandidate(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PanelMessage message={message} onDismiss={() => setMessage(null)} />
      {form && (
        <AccessDrawer
          form={form}
          professionals={availableProfessionals}
          busy={busyId === (form.id || "new")}
          onChange={setForm}
          onRoleChange={changeRole}
          onTogglePermission={togglePermission}
          onRestoreDefault={restoreDefaultPermissions}
          onClose={() => setForm(null)}
          onSubmit={submit}
        />
      )}
      {activeCandidate && (
        <div className="panel-conflict" role="alertdialog" aria-label="Alterar status do acesso">
          <strong>
            {activeCandidate.membershipActive ? "Desativar" : "Ativar"} o acesso de{" "}
            {activeCandidate.name || activeCandidate.email}?
          </strong>
          <p>
            {activeCandidate.membershipActive
              ? "O usuário deixará de acessar este negócio até ser ativado novamente."
              : "O usuário voltará a acessar os módulos permitidos para sua role."}
          </p>
          <div className="panel-conflict-actions">
            <button
              className={activeCandidate.membershipActive ? "panel-btn-danger" : "panel-btn-primary"}
              type="button"
              disabled={busyId === activeCandidate.id}
              onClick={toggleActive}
            >
              {activeCandidate.membershipActive ? "Desativar acesso" : "Ativar acesso"}
            </button>
            <button className="panel-btn" type="button" onClick={() => setActiveCandidate(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="panel-toolbar">
        <span className="panel-hint">
          {members.filter((member) => member.active).length} acesso(s) ativo(s)
        </span>
        <span className="panel-toolbar-spacer" />
        <button className="panel-btn" type="button" onClick={team.reload}>Atualizar</button>
        <button className="panel-btn-primary" type="button" onClick={() => setForm(emptyForm())}>
          Adicionar usuário
        </button>
      </div>

      {team.state === "loading" && !team.data && <PanelLoading rows={4} label="Carregando equipe…" />}
      {team.state === "error" && <PanelError onRetry={team.reload}>{team.error}</PanelError>}

      {team.data && (members.length === 0 ? (
        <PanelEmpty title="Nenhum acesso cadastrado">
          Adicione o primeiro usuário por e-mail.
        </PanelEmpty>
      ) : (
        <div className="panel-team-list">
          <div className="panel-team-head" aria-hidden="true">
            <span>Usuário</span>
            <span>Role e vínculo</span>
            <span>Permissões</span>
            <span>Último acesso</span>
            <span>Status</span>
            <span />
          </div>
          {members.map((member) => (
            <div className={`panel-team-row${member.active ? "" : " panel-row--muted"}`} key={member.id}>
              <div className="panel-team-identity">
                <strong>{member.name || member.email}</strong>
                <span>{member.email}</span>
              </div>
              <div className="panel-team-cell">
                <strong>{roleLabels[member.role] || member.role}</strong>
                <span>{member.professional?.name || "Sem vínculo profissional"}</span>
                {!matchesPreset(member.role, member.permissions) && (
                  <span className="panel-preset-badge is-custom">Personalizado</span>
                )}
              </div>
              <div className="panel-team-permissions">
                {member.permissions.map((permission) => (
                  <span className="panel-tag" key={permission}>{permissionLabels[permission] || permission}</span>
                ))}
              </div>
              <div className="panel-team-cell">
                <strong>{accessDate(member.lastAccessAt)}</strong>
                <span>{member.lastAccessAt ? "Registrado no máximo 1x/h" : "Sem registro"}</span>
              </div>
              <div className="panel-team-cell">
                <strong>{member.active ? "Ativo" : "Inativo"}</strong>
                {!member.identityActive && <span>Identidade global inativa</span>}
              </div>
              <RowActions
                primary={[
                  {
                    key: "edit",
                    label: "Editar",
                    className: "panel-btn-primary",
                    onClick: () => setForm(formFromMember(member))
                  }
                ]}
                secondary={[
                  {
                    key: "active",
                    label: member.membershipActive ? "Desativar" : "Ativar",
                    danger: member.membershipActive,
                    onClick: () => setActiveCandidate(member),
                    disabled: busyId === member.id || !member.identityActive
                  }
                ]}
              />
            </div>
          ))}
        </div>
      ))}

      <section className="panel-block panel-team-audit">
        <div className="panel-block-head">
          <h2>Auditoria de acessos</h2>
          <p>{auditPagination.total} mudança(s) registrada(s)</p>
        </div>

        {audit.state === "loading" && !audit.data && <PanelLoading rows={3} label="Carregando auditoria…" />}
        {audit.state === "error" && <PanelError onRetry={audit.reload}>{audit.error}</PanelError>}
        {audit.data && (auditItems.length === 0 ? (
          <PanelEmpty title="Nenhuma mudança registrada">
            Alterações de role, permissões e status aparecerão aqui.
          </PanelEmpty>
        ) : (
          <>
            <ol className="panel-audit-list">
              {auditItems.map((event) => (
                <li key={event.id}>
                  <div>
                    <strong>{auditActionLabels[event.action] || event.action}</strong>
                    <span>{event.targetName || event.targetId} · {auditChange(event)}</span>
                  </div>
                  <div>
                    <strong>{event.actorName || event.actorId}</strong>
                    <span>{accessDate(event.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="panel-pagination">
              <button
                className="panel-btn"
                type="button"
                disabled={auditPagination.page <= 1}
                onClick={() => setAuditPage((page) => page - 1)}
              >
                Anterior
              </button>
              <span>Página {auditPagination.page} de {auditPagination.pages}</span>
              <button
                className="panel-btn"
                type="button"
                disabled={auditPagination.page >= auditPagination.pages}
                onClick={() => setAuditPage((page) => page + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        ))}
      </section>
    </>
  );
}
