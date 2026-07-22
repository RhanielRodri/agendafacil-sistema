import { errorResponse, json, notFound } from "../../shared/src/http";
import { calculateD1Availability } from "../../shared/src/availability";
import {
  listPublicBusinessHours,
  listPublicProfessionals,
  listPublicServices,
  publicContext,
  publicSettings
} from "../../shared/src/public-catalog";
import { findActiveTenant, tenantSlugFromPath } from "../../shared/src/tenant";
import type { PublicEnv } from "../../shared/src/types";

const TENANT_ROUTE = /^\/api\/tenants\/([^/]+)\/(context|services|professionals|business-hours|settings|available-slots)$/;

async function handleApi(request: Request, env: PublicEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/live") {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ ok: result?.ok === 1 });
  }

  const tenantSlug = tenantSlugFromPath(url.pathname, TENANT_ROUTE);
  if (request.method === "GET" && tenantSlug) {
    const tenant = await findActiveTenant(env.DB, tenantSlug);
    const resource = url.pathname.split("/").at(-1);
    if (resource === "context") return json(await publicContext(env.DB, tenant));
    if (resource === "services") return json(await listPublicServices(env.DB, tenant.slug));
    if (resource === "professionals") return json(await listPublicProfessionals(env.DB, tenant.slug));
    if (resource === "business-hours") return json(await listPublicBusinessHours(env.DB, tenant.slug));
    if (resource === "settings") return json(await publicSettings(env.DB, tenant));
    if (resource === "available-slots") {
      const result = await calculateD1Availability(env.DB, tenant.slug, url.searchParams);
      return json(result.slots);
    }
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
