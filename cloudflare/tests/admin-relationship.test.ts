import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  EMAIL_LUMIERE,
  IDENTITY_LUMIERE,
  IDENTITY_STUDIO,
  adminCall,
  adminJson,
  adminPath,
  setupAdminAccess
} from "./admin-harness";

const FUTURE = "2099-03-10";

interface LeadPayload {
  id: string;
  status: string;
  priority: string;
  ownerUserId: string | null;
  qualification: Record<string, unknown> | null;
  nextFollowUp: { id: string; type: string } | null;
  convertedAppointmentId: string | null;
}

beforeAll(async () => {
  await setupAdminAccess();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone, email, normalized_email, last_contact_at)
      VALUES ('rel-client-studio', 'studio-cut', 'Joana Studio', '(27) 98888-1000', '27988881000', 'joana@cliente.invalid', 'joana@cliente.invalid', '2026-07-01T10:00:00.000Z')
    `),
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone, last_contact_at)
      VALUES ('rel-client-studio-2', 'studio-cut', 'Marcos Studio', '(27) 98888-2000', '27988882000', '2026-07-02T10:00:00.000Z')
    `),
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
      VALUES ('rel-client-lumiere', 'lumiere', 'Cliente Lumière', '(27) 98888-3000', '27988883000')
    `),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) VALUES (
        'rel-appointment-studio', 'studio-cut', 'service-studio-cut', 'professional-studio-1',
        'rel-client-studio', 'Joana Studio', '(27) 98888-1000', ?, '09:00', '09:30', 'CONFIRMED'
      )
    `).bind(FUTURE),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) VALUES (
        'rel-appointment-lumiere', 'lumiere', 'service-lumiere-skin', 'professional-lumiere-1',
        'rel-client-lumiere', 'Cliente Lumière', '(27) 98888-3000', ?, '11:00', '12:00', 'PENDING'
      )
    `).bind(FUTURE)
  ]);
});

describe("clientes administrativos", () => {
  it("lista, busca e pagina somente clientes do tenant", async () => {
    const all = await adminJson<{ id: string }[]>(adminPath("studio-cut", "clients"));
    const search = await adminJson<{ id: string }[]>(`${adminPath("studio-cut", "clients")}?search=Joana`);
    const phoneSearch = await adminJson<{ id: string }[]>(
      `${adminPath("studio-cut", "clients")}?search=${encodeURIComponent("+55 (27) 98888-1000")}`
    );
    const paged = await adminJson<{ items: unknown[]; pagination: { total: number; pages: number } }>(
      `${adminPath("studio-cut", "clients")}?page=1&pageSize=1`
    );
    expect(all.map((row) => row.id).sort()).toEqual(["rel-client-studio", "rel-client-studio-2"]);
    expect(search.map((row) => row.id)).toEqual(["rel-client-studio"]);
    expect(phoneSearch.map((row) => row.id)).toEqual(["rel-client-studio"]);
    expect(paged.items).toHaveLength(1);
    expect(paged.pagination).toMatchObject({ total: 2, pages: 2 });
  });

  it("retorna 404 para cliente de outro tenant em detalhe, histórico e nota", async () => {
    const target = adminPath("studio-cut", "clients/rel-client-lumiere");
    const [detail, history, note] = await Promise.all([
      adminCall(target),
      adminCall(`${target}/history`),
      adminCall(`${target}/notes`, { method: "POST", body: { note: "tentativa" } })
    ]);
    expect([detail.status, history.status, note.status]).toEqual([404, 404, 404]);
  });

  it("atualiza cliente e registra histórico, recusando telefone duplicado", async () => {
    const updated = await adminCall(adminPath("studio-cut", "clients/rel-client-studio"), {
      method: "PATCH",
      body: { name: "Joana Studio Silva" }
    });
    const duplicate = await adminCall(adminPath("studio-cut", "clients/rel-client-studio"), {
      method: "PATCH",
      body: { phone: "(27) 98888-2000" }
    });
    const history = await adminJson<{ type: string; actorId: string }[]>(
      adminPath("studio-cut", "clients/rel-client-studio/history")
    );
    expect(updated.status).toBe(200);
    expect(duplicate.status).toBe(409);
    expect(history[0]).toMatchObject({ type: "CLIENT_UPDATED", actorId: IDENTITY_STUDIO });
  });

  it("recusa nota vazia e nota com termo clínico", async () => {
    const empty = await adminCall(adminPath("studio-cut", "clients/rel-client-studio/notes"), {
      method: "POST",
      body: { note: "   " }
    });
    const clinical = await adminCall(adminPath("studio-cut", "clients/rel-client-studio/notes"), {
      method: "POST",
      body: { note: "Cliente relatou sintoma persistente" }
    });
    expect([empty.status, clinical.status]).toEqual([400, 400]);
  });
});

describe("leads administrativos", () => {
  let leadId = "";

  it("cria lead com próxima ação obrigatória e reutiliza o lead ativo equivalente", async () => {
    const missingAction = await adminCall(adminPath("studio-cut", "leads"), {
      method: "POST",
      body: { clientId: "rel-client-studio", source: "CONTACT" }
    });
    const created = await adminCall(adminPath("studio-cut", "leads"), {
      method: "POST",
      body: {
        clientId: "rel-client-studio",
        source: "CONTACT",
        interestSummary: "Quer corte no sábado",
        nextFollowUp: { dueAt: `${FUTURE}T12:00:00.000Z`, type: "CONTACT" }
      }
    });
    const lead = await created.json() as LeadPayload;
    leadId = lead.id;

    const reused = await adminCall(adminPath("studio-cut", "leads"), {
      method: "POST",
      body: {
        clientId: "rel-client-studio",
        source: "CONTACT",
        interestSummary: "Quer corte no sábado",
        nextFollowUp: { dueAt: `${FUTURE}T12:00:00.000Z`, type: "CONTACT" }
      }
    });
    const reusedLead = await reused.json() as LeadPayload;

    expect(missingAction.status).toBe(400);
    expect(created.status).toBe(201);
    expect(lead).toMatchObject({ status: "NEW", priority: "NORMAL", ownerUserId: IDENTITY_STUDIO });
    expect(lead.nextFollowUp).toMatchObject({ type: "CONTACT" });
    expect(reused.status).toBe(200);
    expect(reusedLead.id).toBe(leadId);
  });

  it("recusa cliente e responsável de outro tenant", async () => {
    const otherClient = await adminCall(adminPath("studio-cut", "leads"), {
      method: "POST",
      body: {
        clientId: "rel-client-lumiere",
        source: "MANUAL",
        nextFollowUp: { dueAt: `${FUTURE}T12:00:00.000Z`, type: "CONTACT" }
      }
    });
    const otherOwner = await adminCall(adminPath("studio-cut", `leads/${leadId}/owner`), {
      method: "PATCH",
      body: { ownerUserId: IDENTITY_LUMIERE }
    });
    expect([otherClient.status, otherOwner.status]).toEqual([404, 404]);
  });

  it("valida qualificação pela vertical e bloqueia termo clínico", async () => {
    const foreignField = await adminCall(adminPath("studio-cut", `leads/${leadId}/qualification`), {
      method: "PATCH",
      body: { qualification: { procedureInterest: "Limpeza" } }
    });
    const clinical = await adminCall(adminPath("studio-cut", `leads/${leadId}/qualification`), {
      method: "PATCH",
      body: { qualification: { commercialNote: "Cliente citou doença de pele" } }
    });
    const valid = await adminJson<LeadPayload>(adminPath("studio-cut", `leads/${leadId}/qualification`), {
      method: "PATCH",
      body: { qualification: { firstVisit: true, urgency: "THIS_WEEK" } }
    });
    expect([foreignField.status, clinical.status]).toEqual([400, 400]);
    expect(valid.qualification).toEqual({ firstVisit: true, urgency: "THIS_WEEK" });
  });

  it("avança o status exigindo próxima ação aberta e recusa transição terminal direta", async () => {
    const direct = await adminCall(adminPath("studio-cut", `leads/${leadId}/status`), {
      method: "PATCH",
      body: { status: "CONVERTED" }
    });
    const advanced = await adminJson<LeadPayload>(adminPath("studio-cut", `leads/${leadId}/status`), {
      method: "PATCH",
      body: { status: "CONTACTED" }
    });
    expect(direct.status).toBe(400);
    expect(advanced.status).toBe("CONTACTED");
  });

  it("altera prioridade e registra evento uma única vez", async () => {
    await adminCall(adminPath("studio-cut", `leads/${leadId}/priority`), {
      method: "PATCH",
      body: { priority: "HIGH" }
    });
    await adminCall(adminPath("studio-cut", `leads/${leadId}/priority`), {
      method: "PATCH",
      body: { priority: "HIGH" }
    });
    const events = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM relationship_history_events
      WHERE tenant_id = 'studio-cut' AND lead_id = ? AND type = 'LEAD_PRIORITY_CHANGED'
    `).bind(leadId).first<{ total: number }>();
    expect(events?.total).toBe(1);
  });

  it("converte com agendamento existente, fecha follow-ups e preserva o agendamento", async () => {
    const crossTenant = await adminCall(adminPath("studio-cut", `leads/${leadId}/convert`), {
      method: "POST",
      body: { appointmentId: "rel-appointment-lumiere" }
    });
    const converted = await adminJson<LeadPayload>(adminPath("studio-cut", `leads/${leadId}/convert`), {
      method: "POST",
      body: { appointmentId: "rel-appointment-studio" }
    });
    const [appointment, openFollowUps] = await Promise.all([
      env.DB.prepare("SELECT status, lead_id FROM appointments WHERE id = 'rel-appointment-studio'")
        .first<{ status: string; lead_id: string }>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM follow_ups WHERE lead_id = ? AND status = 'OPEN'")
        .bind(leadId).first<{ total: number }>()
    ]);

    expect(crossTenant.status).toBe(404);
    expect(converted).toMatchObject({ status: "CONVERTED", convertedAppointmentId: "rel-appointment-studio" });
    expect(appointment).toMatchObject({ status: "CONFIRMED", lead_id: leadId });
    expect(openFollowUps?.total).toBe(0);
  });

  it("é idempotente na conversão e recusa outro agendamento", async () => {
    const same = await adminCall(adminPath("studio-cut", `leads/${leadId}/convert`), {
      method: "POST",
      body: { appointmentId: "rel-appointment-studio" }
    });
    const other = await adminCall(adminPath("studio-cut", `leads/${leadId}/convert`), {
      method: "POST",
      body: { appointmentId: "rel-appointment-lumiere" }
    });
    expect(same.status).toBe(200);
    expect(other.status).toBe(409);
  });

  it("registra perda estruturada e recusa motivo livre sem observação", async () => {
    const lost = await adminJson<LeadPayload>(adminPath("studio-cut", "leads"), {
      method: "POST",
      body: {
        clientId: "rel-client-studio-2",
        source: "WAITLIST",
        nextFollowUp: { dueAt: `${FUTURE}T15:00:00.000Z`, type: "WAITLIST" }
      }
    });
    const missingNote = await adminCall(adminPath("studio-cut", `leads/${lost.id}/lost`), {
      method: "POST",
      body: { lostReason: "OTHER" }
    });
    const applied = await adminJson<LeadPayload>(adminPath("studio-cut", `leads/${lost.id}/lost`), {
      method: "POST",
      body: { lostReason: "PRICE" }
    });
    const cancelled = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM follow_ups WHERE lead_id = ? AND status = 'CANCELLED'"
    ).bind(lost.id).first<{ total: number }>();

    expect(missingNote.status).toBe(400);
    expect(applied.status).toBe("LOST");
    expect(cancelled?.total).toBe(1);
  });

  it("não expõe lead de outro tenant nem sua chave de deduplicação", async () => {
    const lead = await adminJson<Record<string, unknown>>(adminPath("studio-cut", `leads/${leadId}`));
    const lumiere = await adminJson<{ id: string }[]>(adminPath("lumiere", "leads"), { email: EMAIL_LUMIERE });
    expect(lead).not.toHaveProperty("dedupeKey");
    expect(lumiere).toHaveLength(0);
  });
});

describe("follow-ups administrativos", () => {
  let followUpId = "";

  it("cria follow-up avulso e filtra por vencidos e sem responsável", async () => {
    const created = await adminJson<{ id: string; overdue: boolean }>(adminPath("studio-cut", "follow-ups"), {
      method: "POST",
      body: { clientId: "rel-client-studio", dueAt: "2020-01-01T10:00:00.000Z", type: "RETURN" }
    });
    followUpId = created.id;
    const overdue = await adminJson<{ id: string }[]>(`${adminPath("studio-cut", "follow-ups")}?overdue=true`);
    const invalidFilter = await adminCall(`${adminPath("studio-cut", "follow-ups")}?overdue=talvez`);
    expect(created.overdue).toBe(true);
    expect(overdue.map((row) => row.id)).toContain(followUpId);
    expect(invalidFilter.status).toBe(400);
  });

  it("conclui o follow-up e recusa reabertura", async () => {
    const completed = await adminJson<{ status: string; nextFollowUp: unknown }>(
      adminPath("studio-cut", `follow-ups/${followUpId}/complete`),
      { method: "POST", body: {} }
    );
    const cancelAfter = await adminCall(adminPath("studio-cut", `follow-ups/${followUpId}/cancel`), {
      method: "POST",
      body: {}
    });
    const owner = await adminCall(adminPath("studio-cut", `follow-ups/${followUpId}/owner`), {
      method: "PATCH",
      body: { ownerUserId: null }
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.nextFollowUp).toBeNull();
    expect(cancelAfter.status).toBe(409);
    expect(owner.status).toBe(409);
  });

  it("não alcança follow-up de outro tenant", async () => {
    const foreign = await adminCall(adminPath("lumiere", `follow-ups/${followUpId}/complete`), {
      method: "POST",
      body: {},
      email: EMAIL_LUMIERE
    });
    expect(foreign.status).toBe(404);
  });

  it("recusa data e tipo inválidos", async () => {
    const badDate = await adminCall(adminPath("studio-cut", "follow-ups"), {
      method: "POST",
      body: { clientId: "rel-client-studio", dueAt: "amanhã", type: "CONTACT" }
    });
    const badType = await adminCall(adminPath("studio-cut", "follow-ups"), {
      method: "POST",
      body: { clientId: "rel-client-studio", dueAt: `${FUTURE}T10:00:00.000Z`, type: "LIGAR" }
    });
    expect([badDate.status, badType.status]).toEqual([400, 400]);
  });
});

describe("arquivamento e exclusão de clientes", () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
        VALUES ('lifecycle-filter', 'studio-cut', 'Cliente Arquivável', '27999333001', '27999333001')
      `),
      env.DB.prepare(`
        INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
        VALUES ('lifecycle-delete', 'studio-cut', 'Cliente Excluível', '27999333002', '27999333002')
      `),
      env.DB.prepare(`
        INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
        VALUES ('lifecycle-blocked', 'studio-cut', 'Cliente com Histórico', '27999333003', '27999333003')
      `),
      env.DB.prepare(`
        INSERT INTO appointments (
          id, tenant_id, service_id, professional_id, client_id,
          client_name, client_phone, appointment_date, start_time, end_time, status
        ) VALUES (
          'lifecycle-appointment', 'studio-cut', 'service-studio-cut', 'professional-studio-1',
          'lifecycle-blocked', 'Cliente com Histórico', '27999333003',
          '2098-09-14', '09:00', '09:45', 'CONFIRMED'
        )
      `),
      env.DB.prepare(`
        INSERT INTO relationship_history_events (
          id, tenant_id, client_id, type, actor_type, metadata_json
        ) VALUES (
          'lifecycle-history', 'studio-cut', 'lifecycle-blocked',
          'CLIENT_CREATED', 'SYSTEM', '{"source":"test"}'
        )
      `)
    ]);
  });

  it("arquiva, filtra e restaura sem apagar relações", async () => {
    const archived = await adminCall(adminPath("studio-cut", "clients/lifecycle-filter/archive"), {
      method: "PATCH",
      body: {}
    });
    const active = await adminJson<{ id: string }[]>(adminPath("studio-cut", "clients"));
    const archivedRows = await adminJson<{ id: string }[]>(
      `${adminPath("studio-cut", "clients")}?status=archived`
    );
    const all = await adminJson<{ id: string }[]>(
      `${adminPath("studio-cut", "clients")}?status=all`
    );
    const restored = await adminCall(adminPath("studio-cut", "clients/lifecycle-filter/restore"), {
      method: "PATCH",
      body: {}
    });

    expect(archived.status).toBe(200);
    expect(active.some((client) => client.id === "lifecycle-filter")).toBe(false);
    expect(archivedRows.some((client) => client.id === "lifecycle-filter")).toBe(true);
    expect(all.some((client) => client.id === "lifecycle-filter")).toBe(true);
    expect(restored.status).toBe(200);
    expect((await restored.json() as { archived: boolean }).archived).toBe(false);
  });

  it("exclui definitivamente somente cadastro sem dependências", async () => {
    const eligibility = await adminCall(
      adminPath("studio-cut", "clients/lifecycle-delete/dependencies")
    );
    const removed = await adminCall(adminPath("studio-cut", "clients/lifecycle-delete"), {
      method: "DELETE"
    });
    const missing = await adminCall(adminPath("studio-cut", "clients/lifecycle-delete"));

    expect(eligibility.status).toBe(200);
    expect(await eligibility.json()).toMatchObject({
      canDelete: true,
      dependencies: { appointments: 0, leads: 0, followUps: 0, history: 0 }
    });
    expect(removed.status).toBe(204);
    expect(missing.status).toBe(404);
  });

  it("retorna 409 com dependências quando a exclusão está bloqueada", async () => {
    const response = await adminCall(adminPath("studio-cut", "clients/lifecycle-blocked"), {
      method: "DELETE"
    });
    const body = await response.json() as {
      error: {
        code: string;
        dependencies: { appointments: number; leads: number; followUps: number; history: number };
      };
    };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.dependencies).toEqual({
      appointments: 1,
      leads: 0,
      followUps: 0,
      history: 1
    });
  });

  it("não arquiva, restaura ou exclui cliente de outro tenant", async () => {
    const archive = await adminCall(adminPath("studio-cut", "clients/rel-client-lumiere/archive"), {
      method: "PATCH",
      body: {}
    });
    const restore = await adminCall(adminPath("studio-cut", "clients/rel-client-lumiere/restore"), {
      method: "PATCH",
      body: {}
    });
    const remove = await adminCall(adminPath("studio-cut", "clients/rel-client-lumiere"), {
      method: "DELETE"
    });

    expect([archive.status, restore.status, remove.status]).toEqual([404, 404, 404]);
  });
});
