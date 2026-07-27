import type { AdminContext, AdminEnv } from "../../shared/src/types";
import type { AdminModule } from "../../shared/src/rbac";

export interface AdminRequestContext {
  request: Request;
  env: AdminEnv;
  db: D1Database;
  url: URL;
  // Único tenant autorizado: vem do slug da rota, confirmado por AdminMembership.
  tenantId: string;
  admin: AdminContext;
  params: string[];
}

export type AdminHandler = (ctx: AdminRequestContext) => Promise<Response>;

export interface AdminRoute {
  method: string;
  pattern: RegExp;
  module: AdminModule | null;
  handler: AdminHandler;
}

export function route(
  method: string,
  pattern: RegExp,
  module: AdminModule | null,
  handler: AdminHandler
): AdminRoute {
  return { method, pattern, module, handler };
}

export function matchRoute(
  routes: AdminRoute[],
  method: string,
  resource: string
): { route: AdminRoute; params: string[] } | null {
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const match = resource.match(candidate.pattern);
    if (match) return { route: candidate, params: match.slice(1) };
  }
  return null;
}
