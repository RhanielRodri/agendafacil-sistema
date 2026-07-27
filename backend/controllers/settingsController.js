import prisma from "../prismaClient.js";
import { sanitizeText } from "../services/relationshipService.js";
import { createHttpError } from "./utils.js";
import { parseBrazilPhone } from "../services/phoneService.js";

// Fusos aceitos hoje. A lista é curta de propósito: timezone precisa ser
// explícito e verificável, não texto livre.
export const allowedTimezones = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha"
];

const SLOT_DURATIONS = [10, 15, 20, 30, 45, 60];
const MAX_ADVANCE_MINUTES = 10080;
const MAX_FUTURE_DAYS = 365;

export const defaultSettings = {
  publicName: null,
  publicPhone: null,
  publicWhatsapp: null,
  addressLine: null,
  timezone: "America/Sao_Paulo",
  slotDurationMinutes: 30,
  minAdvanceMinutes: 0,
  maxFutureDays: 90,
  cancellationPolicy: null,
  confirmationMessage: null,
  bookingEnabled: true
};

export async function loadSettings(tenantId, client = prisma) {
  const settings = await client.tenantSettings.findUnique({ where: { tenantId } });
  return settings || { ...defaultSettings, tenantId, id: null };
}

function parsePhone(value, field) {
  const text = sanitizeText(value, 30);
  if (text === null) return null;
  const phone = parseBrazilPhone(text);
  if (!phone) throw createHttpError(400, `${field} inválido`);
  return phone.normalized;
}

function parseInteger(value, { field, min, max, allowed }) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw createHttpError(400, `${field} inválido`);
  if (allowed && !allowed.includes(number)) throw createHttpError(400, `${field} inválido`);
  if (!allowed && (number < min || number > max)) throw createHttpError(400, `${field} inválido`);
  return number;
}

// Texto operacional é texto: nada de HTML entrando por aqui.
function parsePlainText(value, maxLength, field) {
  const text = sanitizeText(value, maxLength);
  if (text && /[<>]/.test(text)) throw createHttpError(400, `${field} não aceita marcação HTML`);
  return text;
}

export async function getSettings(req, res, next) {
  try {
    res.json(await loadSettings(req.auth.tenantId));
  } catch (error) {
    next(error);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const body = req.body || {};
    const data = {};

    if (Object.hasOwn(body, "publicName")) data.publicName = parsePlainText(body.publicName, 120, "Nome público");
    if (Object.hasOwn(body, "publicPhone")) data.publicPhone = parsePhone(body.publicPhone, "Telefone público");
    if (Object.hasOwn(body, "publicWhatsapp")) data.publicWhatsapp = parsePhone(body.publicWhatsapp, "WhatsApp público");
    if (Object.hasOwn(body, "addressLine")) data.addressLine = parsePlainText(body.addressLine, 160, "Endereço");
    if (Object.hasOwn(body, "timezone")) {
      if (!allowedTimezones.includes(body.timezone)) throw createHttpError(400, "Timezone inválido");
      data.timezone = body.timezone;
    }
    if (Object.hasOwn(body, "slotDurationMinutes")) {
      data.slotDurationMinutes = parseInteger(body.slotDurationMinutes, {
        field: "Duração do slot",
        allowed: SLOT_DURATIONS
      });
    }
    if (Object.hasOwn(body, "minAdvanceMinutes")) {
      data.minAdvanceMinutes = parseInteger(body.minAdvanceMinutes, {
        field: "Antecedência mínima",
        min: 0,
        max: MAX_ADVANCE_MINUTES
      });
    }
    if (Object.hasOwn(body, "maxFutureDays")) {
      data.maxFutureDays = parseInteger(body.maxFutureDays, { field: "Limite futuro", min: 1, max: MAX_FUTURE_DAYS });
    }
    if (Object.hasOwn(body, "cancellationPolicy")) {
      data.cancellationPolicy = parsePlainText(body.cancellationPolicy, 500, "Política de cancelamento");
    }
    if (Object.hasOwn(body, "confirmationMessage")) {
      data.confirmationMessage = parsePlainText(body.confirmationMessage, 300, "Texto de confirmação");
    }
    if (Object.hasOwn(body, "bookingEnabled")) {
      if (typeof body.bookingEnabled !== "boolean") throw createHttpError(400, "bookingEnabled inválido");
      data.bookingEnabled = body.bookingEnabled;
    }

    if (!Object.keys(data).length) throw createHttpError(400, "Nenhum campo válido para atualizar");

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...defaultSettings, ...data }
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

// Recorte público: nada de configuração interna sai por esta rota.
export async function getPublicSettings(req, res, next) {
  try {
    const settings = await loadSettings(req.tenant.slug);
    res.json({
      publicName: settings.publicName || req.tenant.name,
      publicPhone: settings.publicPhone,
      publicWhatsapp: settings.publicWhatsapp,
      addressLine: settings.addressLine,
      timezone: settings.timezone,
      cancellationPolicy: settings.cancellationPolicy,
      confirmationMessage: settings.confirmationMessage,
      bookingEnabled: settings.bookingEnabled,
      maxFutureDays: settings.maxFutureDays
    });
  } catch (error) {
    next(error);
  }
}
