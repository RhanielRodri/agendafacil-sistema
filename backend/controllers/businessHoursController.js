import prisma from "../prismaClient.js";

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
