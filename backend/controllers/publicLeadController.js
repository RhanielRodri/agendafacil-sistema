import prisma from "../prismaClient.js";
import {
  appendRelationshipEvent,
  createOrReuseLead,
  findOrCreateClient,
  runSerializable,
  sanitizeText,
  validateLeadReferences,
  validatePerson
} from "../services/relationshipService.js";
import { createHttpError } from "./utils.js";

const publicSources = Object.freeze({
  "studio-cut": Object.freeze(["WAITLIST", "CONTACT"]),
  lumiere: Object.freeze(["EVALUATION", "CONTACT"])
});

const followUpTypeBySource = Object.freeze({
  WAITLIST: "WAITLIST",
  EVALUATION: "EVALUATION",
  CONTACT: "CONTACT"
});

function publicResponse(source, reused, followUpCreated) {
  return {
    message: "Solicitação recebida. O negócio poderá entrar em contato pelos dados informados.",
    status: reused ? "RECEIVED" : "CREATED",
    source,
    followUpCreated
  };
}

export async function capturePublicLead(req, res, next) {
  try {
    const tenantId = req.tenant.slug;
    const source = req.body?.source;
    if (sanitizeText(req.body?.website, 120)) {
      res.status(202).json(publicResponse(source || "CONTACT", true, false));
      return;
    }
    if (!publicSources[tenantId]?.includes(source)) throw createHttpError(400, "Tipo de solicitação inválido");
    if (req.body?.consent !== true) throw createHttpError(400, "Confirme o uso dos dados para contato");
    const person = validatePerson(req.body);
    const interestSummary = sanitizeText(req.body?.interestSummary, 500);
    if (!interestSummary || interestSummary.length < 3) throw createHttpError(400, "Descreva brevemente seu interesse");

    const result = await runSerializable(prisma, async (tx) => {
      const refs = await validateLeadReferences(tx, tenantId, req.body);
      const clientResult = await findOrCreateClient(tx, {
        tenantId,
        person,
        actorType: "CUSTOMER",
        source
      });
      const leadResult = await createOrReuseLead(tx, {
        tenantId,
        clientId: clientResult.client.id,
        source,
        ...refs,
        interestSummary,
        actorType: "CUSTOMER"
      });

      let followUpCreated = false;
      if (req.body?.createFollowUp === true && leadResult.created) {
        const owner = await tx.adminUser.findFirst({
          where: { tenantId, active: true },
          orderBy: { id: "asc" }
        });
        if (owner) {
          const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          const followUp = await tx.followUp.create({
            data: {
              tenantId,
              clientId: clientResult.client.id,
              leadId: leadResult.lead.id,
              dueAt,
              type: followUpTypeBySource[source],
              createdByUserId: owner.id
            }
          });
          await appendRelationshipEvent(tx, {
            tenantId,
            clientId: clientResult.client.id,
            leadId: leadResult.lead.id,
            type: "FOLLOW_UP_CREATED",
            actorType: "SYSTEM",
            metadata: { followUpId: followUp.id, source }
          });
          followUpCreated = true;
        }
      }
      return { reused: !leadResult.created, followUpCreated };
    });

    res.status(result.reused ? 200 : 201).json(publicResponse(source, result.reused, result.followUpCreated));
  } catch (error) {
    if (error?.code === "P2002" || error?.code === "P2034") {
      next(createHttpError(409, "Solicitação concorrente detectada. Tente novamente."));
      return;
    }
    next(error);
  }
}
