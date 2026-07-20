import prisma from "../prismaClient.js";

export async function listProfessionals(req, res, next) {
  try {
    const professionals = await prisma.professional.findMany({
      where: { tenantId: req.tenant.slug, active: true },
      orderBy: { name: "asc" }
    });

    res.json(professionals);
  } catch (error) {
    next(error);
  }
}
