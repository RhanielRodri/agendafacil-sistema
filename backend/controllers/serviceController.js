import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function listServices(req, res, next) {
  try {
    const services = await prisma.service.findMany({
      where: { active: true },
      orderBy: { name: "asc" }
    });

    res.json(services);
  } catch (error) {
    next(error);
  }
}
