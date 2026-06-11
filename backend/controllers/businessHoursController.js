import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function listBusinessHours(req, res, next) {
  try {
    const businessHours = await prisma.businessHours.findMany({
      orderBy: { dayOfWeek: "asc" }
    });

    res.json(businessHours);
  } catch (error) {
    next(error);
  }
}
