import prisma from "../prismaClient.js";

export async function listServices(req, res, next) {
  try {
    const services = await prisma.service.findMany({
      where: { tenantId: req.tenant.slug, active: true },
      orderBy: { name: "asc" }
    });

    res.json(services);
  } catch (error) {
    next(error);
  }
}
