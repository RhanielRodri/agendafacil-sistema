import type { JWTVerifyGetKey } from "jose";
import { errorResponse, json, notFound } from "../../shared/src/http";
import { normalizeTenantSlug } from "../../shared/src/tenant";
import type { AdminEnv } from "../../shared/src/types";
import { resolveAdminContext } from "./access";
import { agendaRoutes } from "./agenda";
import { catalogRoutes } from "./catalog";
import { identityRoutes } from "./identity";
import { relationshipRoutes } from "./relationship";
import { matchRoute, type AdminRoute } from "./router";
import { schedulingRoutes } from "./scheduling";

const ADMIN_SCOPE = /^\/api\/admin\/tenants\/([^/]+)\/(.+)$/;

const routes: AdminRoute[] = [
  ...identityRoutes,
  ...agendaRoutes,
  ...relationshipRoutes,
  ...catalogRoutes,
  ...schedulingRoutes
];

interface AdminHandlerOptions {
  jwtKey?: CryptoKey | JWTVerifyGetKey;
}

export function createAdminHandler(options: AdminHandlerOptions = {}): ExportedHandler<AdminEnv> {
  return {
    async fetch(request: Request, env: AdminEnv): Promise<Response> {
      try {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/api/live") {
          const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
          return json({ ok: result?.ok === 1 });
        }

        const scope = url.pathname.match(ADMIN_SCOPE);
        if (!scope) return notFound();

        const tenantSlug = normalizeTenantSlug(scope[1]);
        const matched = matchRoute(routes, request.method, scope[2]);
        if (!matched) return notFound();

        const admin = await resolveAdminContext(request, env, tenantSlug, options.jwtKey);
        return await matched.route.handler({
          request,
          env,
          db: env.DB,
          url,
          tenantId: admin.tenant.slug,
          admin,
          params: matched.params
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}

export default createAdminHandler();
