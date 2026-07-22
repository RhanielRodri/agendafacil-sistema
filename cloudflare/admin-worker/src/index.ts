import type { JWTVerifyGetKey } from "jose";
import { errorResponse, json, notFound } from "../../shared/src/http";
import { normalizeTenantSlug } from "../../shared/src/tenant";
import type { AdminEnv } from "../../shared/src/types";
import { resolveAdminContext } from "./access";

const ADMIN_CONTEXT = /^\/api\/admin\/tenants\/([^/]+)\/context$/;

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

        const match = url.pathname.match(ADMIN_CONTEXT);
        if (request.method === "GET" && match) {
          const tenantSlug = normalizeTenantSlug(match[1]);
          const context = await resolveAdminContext(request, env, tenantSlug, options.jwtKey);
          return json({
            identity: context.identity,
            tenant: context.tenant,
            role: context.role
          });
        }

        return notFound();
      } catch (error) {
        return errorResponse(error);
      }
    }
  };
}

export default createAdminHandler();
