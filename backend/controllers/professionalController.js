import prisma from "../prismaClient.js";
import { resolveDemoId } from "../config/demos.js";
import { createHttpError } from "./utils.js";

export async function listProfessionals(req, res, next) {
  try {
    const demoId = resolveDemoId(req.query.demoId);
    if (!demoId) throw createHttpError(400, "Demonstração inválida");

    const professionals = await prisma.professional.findMany({
      where: { demoId, active: true },
      orderBy: { name: "asc" }
    });

    res.json(professionals);
  } catch (error) {
    next(error);
  }
}
