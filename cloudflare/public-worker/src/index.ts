import { errorResponse, json, notFound } from "../../shared/src/http";
import { findActiveTenant, tenantSlugFromPath } from "../../shared/src/tenant";
import type { PublicEnv } from "../../shared/src/types";

const TENANT_CONTEXT = /^\/api\/tenants\/([^/]+)\/context$/;

async function handleApi(request: Request, env: PublicEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/live") {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ ok: result?.ok === 1 });
  }

  const tenantSlug = tenantSlugFromPath(url.pathname, TENANT_CONTEXT);
  if (request.method === "GET" && tenantSlug) {
    const tenant = await findActiveTenant(env.DB, tenantSlug);
    return json({ tenant });
  }

  return notFound();
}

export default {
  async fetch(request: Request, env: PublicEnv): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return notFound();
    } catch (error) {
      return errorResponse(error);
    }
  }
} satisfies ExportedHandler<PublicEnv>;
