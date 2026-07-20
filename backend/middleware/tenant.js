import { resolveActiveTenant } from "../config/tenant.js";
import { createHttpError } from "../controllers/utils.js";

export function resolveTenant(source = "query") {
  return async (req, res, next) => {
    try {
      const raw = source === "body" ? req.body?.demoId : req.query?.demoId;
      const tenant = await resolveActiveTenant(raw);
      if (!tenant) {
        throw createHttpError(400, "Demonstração inválida");
      }
      req.tenant = tenant;
      next();
    } catch (error) {
      next(error);
    }
  };
}
