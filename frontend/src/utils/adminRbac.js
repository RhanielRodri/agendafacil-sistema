export const adminModuleIds = [
  "visao-geral",
  "agenda",
  "leads",
  "clientes",
  "follow-ups",
  "servicos",
  "profissionais",
  "disponibilidade",
  "bloqueios",
  "indicadores",
  "configuracoes",
  "equipe"
];

export const modulePermission = {
  "visao-geral": "overview",
  agenda: "agenda",
  leads: "leads",
  clientes: "clients",
  "follow-ups": "follow_ups",
  servicos: "services",
  profissionais: "professionals",
  disponibilidade: "scheduling",
  bloqueios: "scheduling",
  indicadores: "metrics",
  configuracoes: "settings",
  equipe: "team"
};

export const permissionLabels = {
  overview: "Visão geral",
  agenda: "Agenda",
  clients: "Clientes",
  leads: "Leads",
  follow_ups: "Follow-ups",
  services: "Serviços",
  professionals: "Profissionais",
  scheduling: "Disponibilidade",
  metrics: "Indicadores",
  settings: "Configurações",
  team: "Equipe e acessos"
};

export const roleLabels = {
  owner: "Owner",
  manager: "Manager",
  receptionist: "Recepcionista",
  professional: "Profissional"
};

export const roleDefaults = {
  owner: Object.keys(permissionLabels),
  manager: Object.keys(permissionLabels).filter((permission) => permission !== "team"),
  receptionist: ["overview", "agenda", "clients", "leads", "follow_ups"],
  professional: ["agenda"]
};

export function allowedModuleIds(permissions = []) {
  const granted = new Set(permissions);
  return adminModuleIds.filter((id) => granted.has(modulePermission[id]));
}
