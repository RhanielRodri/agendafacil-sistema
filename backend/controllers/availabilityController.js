import { calculateAvailability, findFirstAvailability } from "../services/availabilityService.js";
import { createHttpError } from "./utils.js";

export async function listAvailableSlots(req, res, next) {
  try {
    const { date, professionalId, serviceId } = req.query;
    if (!date || !professionalId || !serviceId) {
      throw createHttpError(400, "Informe date, professionalId e serviceId");
    }
    const result = await calculateAvailability({
      tenantId: req.tenant.slug,
      date,
      professionalId,
      serviceId
    });
    res.json(result.slots);
  } catch (error) {
    next(error);
  }
}

export async function getFirstAvailability(req, res, next) {
  try {
    const { date, serviceId } = req.query;
    if (!date || !serviceId) throw createHttpError(400, "Informe date e serviceId");
    const result = await findFirstAvailability({
      tenantId: req.tenant.slug,
      date,
      serviceId
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}
