import {
  appointmentToken,
  cancelPublicAppointment,
  confirmPublicAppointment,
  createPublicAppointment,
  getPublicAppointment,
  rescheduleAvailability,
  reschedulePublicAppointment,
  validatePublicBookingPayload
} from "../../shared/src/booking";
import { errorResponse, json, notFound, readJsonObject } from "../../shared/src/http";
import { serveAsset } from "../../shared/src/assets";
import { calculateD1Availability } from "../../shared/src/availability";
import {
  listPublicBusinessHours,
  listPublicProfessionals,
  listPublicServices,
  publicContext,
  publicSettings
} from "../../shared/src/public-catalog";
import { capturePublicLead } from "../../shared/src/public-leads";
import { enforceRateLimit } from "../../shared/src/rate-limit";
import { enforceFixedTenant, findActiveTenant, tenantSlugFromPath } from "../../shared/src/tenant";
import type { PublicEnv } from "../../shared/src/types";

const TENANT_ROUTE = /^\/api\/tenants\/([^/]+)\/(context|services|professionals|business-hours|settings|available-slots|appointments|leads|appointment(?:\/(?:confirm|cancel|reschedule-availability|reschedule))?)$/;

async function handleApi(request: Request, env: PublicEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/live") {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ ok: result?.ok === 1 });
  }

  const tenantSlug = tenantSlugFromPath(url.pathname, TENANT_ROUTE);
  if (tenantSlug) {
    enforceFixedTenant(env, tenantSlug);
    const tenant = await findActiveTenant(env.DB, tenantSlug);
    const resource = url.pathname.split(`/api/tenants/${tenantSlug}/`)[1];
    if (request.method === "GET" && resource === "context") return json(await publicContext(env.DB, tenant));
    if (request.method === "GET" && resource === "services") return json(await listPublicServices(env.DB, tenant.slug));
    if (request.method === "GET" && resource === "professionals") return json(await listPublicProfessionals(env.DB, tenant.slug));
    if (request.method === "GET" && resource === "business-hours") return json(await listPublicBusinessHours(env.DB, tenant.slug));
    if (request.method === "GET" && resource === "settings") return json(await publicSettings(env.DB, tenant));
    if (request.method === "GET" && resource === "available-slots") {
      const result = await calculateD1Availability(env.DB, tenant.slug, url.searchParams);
      return json(result.slots);
    }
    if (request.method === "POST" && resource === "appointments") {
      await enforceRateLimit(env.DB, request, tenant.slug, "booking:create", 10);
      const payload = validatePublicBookingPayload(await readJsonObject(request));
      return json(await createPublicAppointment(env.DB, tenant.slug, payload), { status: 201 });
    }
    if (request.method === "POST" && resource === "leads") {
      await enforceRateLimit(env.DB, request, tenant.slug, "lead:create", 5);
      const result = await capturePublicLead(env.DB, tenant.slug, await readJsonObject(request));
      return json(result.body, { status: result.status });
    }
    if (request.method === "GET" && resource === "appointment") {
      await enforceRateLimit(env.DB, request, tenant.slug, "booking:read", 60);
      return json(await getPublicAppointment(env.DB, tenant.slug, appointmentToken(request)));
    }
    if (request.method === "POST" && resource === "appointment/confirm") {
      await enforceRateLimit(env.DB, request, tenant.slug, "booking:confirm", 10);
      return json(await confirmPublicAppointment(env.DB, tenant.slug, appointmentToken(request)));
    }
    if (request.method === "POST" && resource === "appointment/cancel") {
      await enforceRateLimit(env.DB, request, tenant.slug, "booking:cancel", 10);
      const payload = await readJsonObject(request);
      return json(await cancelPublicAppointment(env.DB, tenant.slug, appointmentToken(request), payload));
    }
    if (request.method === "GET" && resource === "appointment/reschedule-availability") {
      await enforceRateLimit(env.DB, request, tenant.slug, "booking:reschedule-read", 30);
      return json(await rescheduleAvailability(env.DB, tenant.slug, appointmentToken(request), url.searchParams));
    }
    if (request.method === "POST" && resource === "appointment/reschedule") {
      await enforceRateLimit(env.DB, request, tenant.slug, "booking:reschedule", 10);
      return json(
        await reschedulePublicAppointment(env.DB, tenant.slug, appointmentToken(request), await readJsonObject(request)),
        { status: 201 }
      );
    }
  }

  return notFound();
}

export default {
  async fetch(request: Request, env: PublicEnv): Promise<Response> {
    try {
      const url = new URL(request.url);
      // `/api/*` é resolvido antes de qualquer coisa, então nunca cai no
      // fallback de SPA do Static Assets.
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      if (env.ASSETS) return await serveAsset(request, env.ASSETS, "public");
      return notFound();
    } catch (error) {
      return errorResponse(error);
    }
  }
} satisfies ExportedHandler<PublicEnv>;
