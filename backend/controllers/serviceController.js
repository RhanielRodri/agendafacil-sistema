import prisma from "../prismaClient.js";
import { paginationResult, parsePagination, sanitizeText } from "../services/relationshipService.js";
import {
  assertConfirmed,
  futureAppointments,
  serviceDependencies,
  todayUtc
} from "../services/structuralService.js";
import { createHttpError, sanitizeId } from "./utils.js";

const MIN_DURATION = 5;
const MAX_DURATION = 480;
const MAX_PRICE = 99999.99;

const publicOrder = [{ displayOrder: "asc" }, { name: "asc" }];

export async function listServices(req, res, next) {
  try {
    const services = await prisma.service.findMany({
      where: { tenantId: req.tenant.slug, active: true },
      orderBy: publicOrder
    });

    res.json(services);
  } catch (error) {
    next(error);
  }
}

function parseDuration(value) {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    throw createHttpError(400, `Duração deve ser um inteiro entre ${MIN_DURATION} e ${MAX_DURATION} minutos`);
  }
  return duration;
}

// Preço zero é um preço; preço ausente é ausência de informação. Os dois
// precisam sobreviver ao payload sem virar a mesma coisa.
function parsePrice(value) {
  if (value === null || value === "") return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    throw createHttpError(400, "Preço inválido");
  }
  return Math.round(price * 100) / 100;
}

function parseBoolean(value, field) {
  if (typeof value !== "boolean") throw createHttpError(400, `${field} inválido`);
  return value;
}

function parseOrder(value) {
  const order = Number(value);
  if (!Number.isInteger(order) || order < 0 || order > 999) throw createHttpError(400, "Ordem inválida");
  return order;
}

async function requireService(tenantId, value) {
  const id = sanitizeId(value);
  if (!id) throw createHttpError(400, "ID inválido");
  const service = await prisma.service.findFirst({ where: { id, tenantId } });
  if (!service) throw createHttpError(404, "Serviço não encontrado");
  return service;
}

async function assertNameAvailable(tenantId, name, excludeId) {
  const duplicate = await prisma.service.findFirst({
    where: { tenantId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true }
  });
  if (duplicate) throw createHttpError(409, "Já existe um serviço com esse nome");
}

export async function listAdminServices(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const { page, limit, skip } = parsePagination(req.query);
    const search = sanitizeText(req.query.search, 120);
    const active = req.query.active === undefined || req.query.active === ""
      ? undefined
      : req.query.active === "true";

    const where = {
      tenantId,
      ...(active === undefined ? {} : { active }),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {})
    };

    const [total, services] = await Promise.all([
      prisma.service.count({ where }),
      prisma.service.findMany({
        where,
        include: { _count: { select: { professionals: true, appointments: true } } },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        skip,
        take: limit
      })
    ]);

    // Uma agregação para todos os serviços da página, em vez de uma consulta por linha.
    const ids = services.map((service) => service.id);
    const upcomingGroups = ids.length
      ? await prisma.appointment.groupBy({
        by: ["serviceId"],
        where: {
          tenantId,
          serviceId: { in: ids },
          status: { in: ["PENDING", "CONFIRMED"] },
          date: { gte: todayUtc() }
        },
        _count: { _all: true }
      })
      : [];
    const upcoming = new Map(upcomingGroups.map((group) => [group.serviceId, group._count._all]));

    res.json(paginationResult(
      services.map((service) => ({
        ...service,
        professionalCount: service._count.professionals,
        appointmentCount: service._count.appointments,
        upcomingAppointments: upcoming.get(service.id) || 0
      })),
      total,
      page,
      limit
    ));
  } catch (error) {
    next(error);
  }
}

export async function createService(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const name = sanitizeText(req.body?.name, 80);
    if (!name || name.length < 2) throw createHttpError(400, "Nome do serviço inválido");
    const description = sanitizeText(req.body?.description, 240) || "";
    const duration = parseDuration(req.body?.duration);
    const price = parsePrice(req.body?.price === undefined ? null : req.body.price);
    const displayOrder = req.body?.displayOrder === undefined ? 0 : parseOrder(req.body.displayOrder);
    const requiresEvaluation = req.body?.requiresEvaluation === undefined
      ? false
      : parseBoolean(req.body.requiresEvaluation, "requiresEvaluation");

    await assertNameAvailable(tenantId, name);
    const service = await prisma.service.create({
      data: { tenantId, name, description, duration, price, displayOrder, requiresEvaluation }
    });
    res.status(201).json(service);
  } catch (error) {
    next(error?.code === "P2002" ? createHttpError(409, "Já existe um serviço com esse nome") : error);
  }
}

export async function updateService(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const current = await requireService(tenantId, req.params.id);
    const data = {};

    if (Object.hasOwn(req.body, "name")) {
      const name = sanitizeText(req.body.name, 80);
      if (!name || name.length < 2) throw createHttpError(400, "Nome do serviço inválido");
      await assertNameAvailable(tenantId, name, current.id);
      data.name = name;
    }
    if (Object.hasOwn(req.body, "description")) data.description = sanitizeText(req.body.description, 240) || "";
    if (Object.hasOwn(req.body, "duration")) data.duration = parseDuration(req.body.duration);
    if (Object.hasOwn(req.body, "price")) data.price = parsePrice(req.body.price);
    if (Object.hasOwn(req.body, "displayOrder")) data.displayOrder = parseOrder(req.body.displayOrder);
    if (Object.hasOwn(req.body, "requiresEvaluation")) {
      data.requiresEvaluation = parseBoolean(req.body.requiresEvaluation, "requiresEvaluation");
    }
    if (!Object.keys(data).length) throw createHttpError(400, "Nenhum campo válido para atualizar");

    // Encurtar ou alongar a duração muda o fim de todo agendamento futuro do serviço.
    let appliedImpact = [];
    if (data.duration !== undefined && data.duration !== current.duration) {
      const affected = await futureAppointments(tenantId, { serviceId: current.id });
      appliedImpact = assertConfirmed(affected, req.body?.confirm, "A nova duração afeta agendamentos futuros deste serviço");
    }

    const service = await prisma.service.update({ where: { id: current.id }, data });
    res.json({ ...service, appliedImpact });
  } catch (error) {
    next(error?.code === "P2002" ? createHttpError(409, "Já existe um serviço com esse nome") : error);
  }
}

export async function setServiceActive(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const current = await requireService(tenantId, req.params.id);
    const active = parseBoolean(req.body?.active, "active");

    let appliedImpact = [];
    if (!active && current.active) {
      const affected = await futureAppointments(tenantId, { serviceId: current.id });
      appliedImpact = assertConfirmed(affected, req.body?.confirm, "Existem agendamentos futuros com este serviço");
    }

    const service = await prisma.service.update({ where: { id: current.id }, data: { active } });
    res.json({ ...service, appliedImpact });
  } catch (error) {
    next(error);
  }
}

export async function reorderServices(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const ids = Array.isArray(req.body?.order) ? req.body.order.map(sanitizeId) : null;
    if (!ids || !ids.length || ids.some((id) => !id)) throw createHttpError(400, "Ordem inválida");
    if (new Set(ids).size !== ids.length) throw createHttpError(400, "Ordem com IDs repetidos");

    const owned = await prisma.service.count({ where: { tenantId, id: { in: ids } } });
    if (owned !== ids.length) throw createHttpError(404, "Serviço não encontrado");

    await prisma.$transaction(ids.map((id, index) => prisma.service.update({
      where: { id },
      data: { displayOrder: index }
    })));

    const services = await prisma.service.findMany({
      where: { tenantId },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    });
    res.json(services);
  } catch (error) {
    next(error);
  }
}

export async function getServiceDependencies(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const service = await requireService(tenantId, req.params.id);
    res.json({ serviceId: service.id, ...(await serviceDependencies(tenantId, service.id)) });
  } catch (error) {
    next(error);
  }
}
