import { HttpError } from "./http";

const PUBLIC_SOURCES: Record<string, readonly string[]> = {
  "studio-cut": ["WAITLIST", "CONTACT"],
  lumiere: ["EVALUATION", "CONTACT"]
};

const FOLLOW_UP_TYPE_BY_SOURCE: Record<string, string> = {
  WAITLIST: "WAITLIST",
  EVALUATION: "EVALUATION",
  CONTACT: "CONTACT"
};

const URGENCIES = ["TODAY", "THIS_WEEK", "FLEXIBLE"];

export interface PublicLeadResult {
  status: number;
  body: {
    message: string;
    status: "CREATED" | "RECEIVED";
    source: string;
    followUpCreated: boolean;
  };
}

function invalid(message: string): never {
  throw new HttpError(400, "INVALID_REQUEST", message);
}

function cleanText(value: unknown, field: string, min: number, max: number, required = true): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) invalid(`${field} inválido`);
    return null;
  }
  if (typeof value !== "string" || value.length > max) invalid(`${field} inválido`);
  const clean = value.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (clean.length < min || clean.length > max) invalid(`${field} inválido`);
  return clean;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function response(source: string, reused: boolean, followUpCreated: boolean): PublicLeadResult {
  return {
    status: reused ? 200 : 201,
    body: {
      message: "Solicitação recebida. O negócio poderá entrar em contato pelos dados informados.",
      status: reused ? "RECEIVED" : "CREATED",
      source,
      followUpCreated
    }
  };
}

interface ValidatedLead {
  source: string;
  clientName: string;
  clientPhone: string;
  normalizedPhone: string;
  clientEmail: string | null;
  normalizedEmail: string | null;
  interestSummary: string;
  serviceId: string | null;
  urgency: string | null;
  createFollowUp: boolean;
}

function validate(tenantId: string, payload: Record<string, unknown>): ValidatedLead {
  const source = typeof payload.source === "string" ? payload.source : "";
  if (!PUBLIC_SOURCES[tenantId]?.includes(source)) invalid("Tipo de solicitação inválido");
  if (payload.consent !== true) invalid("Confirme o uso dos dados para contato");

  const clientName = cleanText(payload.name, "Nome", 2, 120) as string;
  const clientPhone = cleanText(payload.phone, "Telefone", 1, 30) as string;
  const normalizedPhone = clientPhone.replace(/\D/g, "");
  if (normalizedPhone.length < 8 || normalizedPhone.length > 15) invalid("Telefone inválido");

  const clientEmail = cleanText(payload.email, "E-mail", 3, 254, false);
  const normalizedEmail = clientEmail?.toLowerCase() ?? null;
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) invalid("E-mail inválido");

  const interestSummary = cleanText(payload.interestSummary, "Interesse", 3, 500) as string;

  const rawService = payload.serviceId;
  const serviceId = rawService === null || rawService === undefined || rawService === ""
    ? null
    : String(rawService);
  if (serviceId !== null && (serviceId.length > 64 || !/^[A-Za-z0-9._-]+$/.test(serviceId))) {
    invalid("Serviço inválido");
  }

  const urgency = payload.urgency ? String(payload.urgency) : null;
  if (urgency && tenantId !== "studio-cut") invalid("Urgência não se aplica a esta vertical");
  if (urgency && !URGENCIES.includes(urgency)) invalid("Urgência inválida");

  return {
    source,
    clientName,
    clientPhone,
    normalizedPhone,
    clientEmail,
    normalizedEmail,
    interestSummary,
    serviceId,
    urgency,
    createFollowUp: payload.createFollowUp === true
  };
}

async function defaultOwnerIdentity(db: D1Database, tenantId: string): Promise<string | null> {
  const row = await db.prepare(`
    SELECT m.identity_id AS id
    FROM admin_memberships m
    JOIN admin_identities i ON i.id = m.identity_id
    WHERE m.tenant_id = ? AND m.active = 1 AND i.active = 1 AND m.role = 'ADMIN'
    ORDER BY m.identity_id
    LIMIT 1
  `).bind(tenantId).first<{ id: string }>();
  return row?.id ?? null;
}

// A captura pública é o único caminho em que o lead nasce sem operador. O
// cliente é criado ou reaproveitado pelo telefone normalizado e o lead ativo
// equivalente é reaproveitado em vez de duplicado.
export async function capturePublicLead(
  db: D1Database,
  tenantId: string,
  payload: Record<string, unknown>
): Promise<PublicLeadResult> {
  if (cleanText(payload.website, "Website", 1, 120, false)) {
    const source = typeof payload.source === "string" ? payload.source : "CONTACT";
    return { status: 202, body: { ...response(source, true, false).body } };
  }

  const input = validate(tenantId, payload);

  if (input.serviceId) {
    const service = await db.prepare("SELECT id FROM services WHERE tenant_id = ? AND id = ? AND active = 1")
      .bind(tenantId, input.serviceId).first<{ id: string }>();
    if (!service) invalid("Serviço inválido");
  }

  const dedupeKey = await sha256Hex([
    input.source,
    input.serviceId ?? 0,
    0,
    input.interestSummary.toLowerCase()
  ].join("|"));

  const now = new Date().toISOString();
  const clientId = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO clients (
      id, tenant_id, name, phone, normalized_phone, email, normalized_email,
      first_contact_at, last_contact_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, normalized_phone) DO UPDATE SET
      email = COALESCE(clients.email, excluded.email),
      normalized_email = COALESCE(clients.normalized_email, excluded.normalized_email),
      last_contact_at = excluded.last_contact_at,
      updated_at = excluded.updated_at
  `).bind(
    clientId, tenantId, input.clientName, input.clientPhone, input.normalizedPhone,
    input.clientEmail, input.normalizedEmail, now, now, now, now
  ).run();

  const client = await db.prepare("SELECT id FROM clients WHERE tenant_id = ? AND normalized_phone = ?")
    .bind(tenantId, input.normalizedPhone).first<{ id: string }>();
  if (!client) throw new HttpError(500, "INTERNAL_ERROR", "Erro interno");

  const existing = await db.prepare(`
    SELECT id FROM leads
    WHERE tenant_id = ? AND client_id = ? AND dedupe_key = ?
      AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')
  `).bind(tenantId, client.id, dedupeKey).first<{ id: string }>();
  if (existing) return response(input.source, true, false);

  const leadId = crypto.randomUUID();
  const qualification = input.urgency
    ? JSON.stringify({ urgency: input.urgency, wantsImmediateOpening: input.source === "WAITLIST" })
    : null;

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO leads (
        id, tenant_id, client_id, source, status, priority, owner_identity_id,
        service_id, professional_id, interest_summary, qualification_json,
        qualification_version, dedupe_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'NEW', ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)
    `).bind(
      leadId, tenantId, client.id, input.source,
      tenantId === "studio-cut" && input.urgency === "TODAY" ? "HIGH" : "NORMAL",
      input.serviceId, input.interestSummary, qualification,
      qualification ? 1 : null, dedupeKey, now, now
    ),
    db.prepare(`
      INSERT INTO relationship_history_events (
        id, tenant_id, client_id, lead_id, type, actor_type, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, 'LEAD_CREATED', 'CUSTOMER', ?, ?)
    `).bind(
      crypto.randomUUID(), tenantId, client.id, leadId,
      JSON.stringify({ source: input.source }), now
    )
  ];

  let followUpCreated = false;
  if (input.createFollowUp) {
    const owner = await defaultOwnerIdentity(db, tenantId);
    if (owner) {
      const followUpId = crypto.randomUUID();
      const dueAt = new Date(Date.now() + 86_400_000).toISOString();
      statements.push(
        db.prepare(`
          INSERT INTO follow_ups (
            id, tenant_id, client_id, lead_id, due_at, type, status, note,
            created_by_identity_id, owner_identity_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', NULL, ?, NULL, ?, ?)
        `).bind(
          followUpId, tenantId, client.id, leadId, dueAt,
          FOLLOW_UP_TYPE_BY_SOURCE[input.source], owner, now, now
        ),
        db.prepare(`
          INSERT INTO relationship_history_events (
            id, tenant_id, client_id, lead_id, type, actor_type, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, 'FOLLOW_UP_CREATED', 'SYSTEM', ?, ?)
        `).bind(
          crypto.randomUUID(), tenantId, client.id, leadId,
          JSON.stringify({ followUpId, source: input.source }), now
        )
      );
      followUpCreated = true;
    }
  }

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/UNIQUE|constraint/i.test(message)) {
      throw new HttpError(409, "CONFLICT", "Solicitação concorrente detectada. Tente novamente.");
    }
    throw error;
  }

  return response(input.source, false, followUpCreated);
}
