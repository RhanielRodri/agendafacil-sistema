import { HttpError } from "./http";

export const ADMIN_ROLES = ["owner", "manager", "receptionist", "professional"] as const;
export const ADMIN_MODULES = [
  "overview",
  "agenda",
  "clients",
  "leads",
  "follow_ups",
  "services",
  "professionals",
  "scheduling",
  "metrics",
  "settings",
  "team"
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type AdminModule = (typeof ADMIN_MODULES)[number];

const ROLE_DEFAULTS: Record<AdminRole, readonly AdminModule[]> = {
  owner: ADMIN_MODULES,
  manager: ADMIN_MODULES.filter((module) => module !== "team"),
  receptionist: ["overview", "agenda", "clients", "leads", "follow_ups"],
  professional: ["agenda"]
};

export function requireAdminRole(value: unknown): AdminRole {
  if (typeof value !== "string" || !ADMIN_ROLES.includes(value as AdminRole)) {
    throw new HttpError(400, "INVALID_REQUEST", "Role inválida");
  }
  return value as AdminRole;
}

export function permissionsForRole(role: AdminRole, value?: unknown): AdminModule[] {
  if (role === "owner" || role === "professional" || value === undefined) {
    return [...ROLE_DEFAULTS[role]];
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, "INVALID_REQUEST", "Permissões inválidas");
  }
  const unique = [...new Set(value)];
  if (unique.some((module) => typeof module !== "string" || !ADMIN_MODULES.includes(module as AdminModule))) {
    throw new HttpError(400, "INVALID_REQUEST", "Permissões inválidas");
  }
  if (unique.includes("team")) {
    throw new HttpError(400, "INVALID_REQUEST", "Permissão de equipe exige role owner");
  }
  return ADMIN_MODULES.filter((module) => unique.includes(module));
}

export function effectivePermissions(role: AdminRole, stored: AdminModule[]): AdminModule[] {
  if (role === "owner" || role === "professional") return [...ROLE_DEFAULTS[role]];
  return ADMIN_MODULES.filter((module) => stored.includes(module) && module !== "team");
}

export function assertModuleAccess(role: AdminRole, permissions: AdminModule[], module: AdminModule | null): void {
  if (module === null) return;
  if (module === "team" && role !== "owner") {
    throw new HttpError(403, "FORBIDDEN", "Acesso negado");
  }
  if (!permissions.includes(module)) {
    throw new HttpError(403, "FORBIDDEN", "Acesso negado");
  }
}
