import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function listProfessionals(req, res, next) {
  try {
    const professionals = await prisma.professional.findMany({
      where: { active: true },
      orderBy: { name: "asc" }
    });

    res.json(professionals);
  } catch (error) {
    next(error);
  }
}
