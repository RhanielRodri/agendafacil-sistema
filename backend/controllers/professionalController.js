import prisma from "../prismaClient.js";
import { paginationResult, parsePagination, sanitizeText } from "../services/relationshipService.js";
import {
  assertConfirmed,
  futureAppointments,
  professionalDependencies,
  todayUtc
} from "../services/structuralService.js";
import { createHttpError, sanitizeId, timeToMinutes } from "./utils.js";

const publicOrder = [{ displayOrder: "asc" }, { name: "asc" }];

export async function listProfessionals(req, res, next) {
  try {
    const professionals = await prisma.professional.findMany({
      where: { tenantId: req.tenant.slug, active: true },
      orderBy: publicOrder
    });

    res.json(professionals);
  } catch (error) {
    next(error);
  }
}

function parseOrder(value) {
  const order = Number(value);
  if (!Number.isInteger(order) || order < 0 || order > 999) throw createHttpError(400, "Ordem inválida");
  return order;
}

async function requireProfessional(tenantId, value) {
  const id = sanitizeId(value);
  if (!id) throw createHttpError(400, "ID inválido");
  const professional = await prisma.professional.findFirst({ where: { id, tenantId } });
  if (!professional) throw createHttpError(404, "Profissional não encontrado");
  return professional;
}

async function assertNameAvailable(tenantId, name, excludeId) {
  const duplicate = await prisma.professional.findFirst({
    where: { tenantId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true }
  });
  if (duplicate) throw createHttpError(409, "Já existe um profissional com esse nome");
}

export async function listAdminProfessionals(req, res, next) {
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
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { specialty: { contains: search, mode: "insensitive" } }
        ]
      } : {})
    };

    const [total, professionals] = await Promise.all([
      prisma.professional.count({ where }),
      prisma.professional.findMany({
        where,
        include: {
          services: { select: { serviceId: true, service: { select: { name: true, active: true } } } },
          _count: { select: { appointments: true, schedules: true } }
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        skip,
        take: limit
      })
    ]);

    const ids = professionals.map((professional) => professional.id);
    const [upcomingGroups, schedules] = ids.length
      ? await Promise.all([
        prisma.appointment.groupBy({
          by: ["professionalId"],
          where: {
            tenantId,
            professionalId: { in: ids },
            status: { in: ["PENDING", "CONFIRMED"] },
            date: { gte: todayUtc() }
          },
          _count: { _all: true }
        }),
        prisma.professionalSchedule.findMany({
          where: { tenantId, professionalId: { in: ids }, active: true },
          select: { professionalId: true, startTime: true, endTime: true }
        })
      ])
      : [[], []];

    const upcoming = new Map(upcomingGroups.map((group) => [group.professionalId, group._count._all]));
    const weeklyMinutes = new Map();
    schedules.forEach((schedule) => {
      const minutes = timeToMinutes(schedule.endTime) - timeToMinutes(schedule.startTime);
      weeklyMinutes.set(schedule.professionalId, (weeklyMinutes.get(schedule.professionalId) || 0) + minutes);
    });

    res.json(paginationResult(
      professionals.map(({ services, _count, ...professional }) => ({
        ...professional,
        serviceIds: services.map((link) => link.serviceId),
        serviceNames: services.map((link) => link.service.name),
        appointmentCount: _count.appointments,
        scheduleCount: _count.schedules,
        weeklyMinutes: weeklyMinutes.get(professional.id) || 0,
        upcomingAppointments: upcoming.get(professional.id) || 0
      })),
      total,
      page,
      limit
    ));
  } catch (error) {
    next(error);
  }
}

export async function createProfessional(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const name = sanitizeText(req.body?.name, 80);
    if (!name || name.length < 2) throw createHttpError(400, "Nome do profissional inválido");
    const specialty = sanitizeText(req.body?.specialty, 120) || "";
    const photo = sanitizeText(req.body?.photo, 300) || "";
    const internalContact = sanitizeText(req.body?.internalContact, 60);
    const displayOrder = req.body?.displayOrder === undefined ? 0 : parseOrder(req.body.displayOrder);

    await assertNameAvailable(tenantId, name);
    const professional = await prisma.professional.create({
      data: { tenantId, name, specialty, photo, internalContact, displayOrder }
    });
    res.status(201).json(professional);
  } catch (error) {
    next(error?.code === "P2002" ? createHttpError(409, "Já existe um profissional com esse nome") : error);
  }
}

export async function updateProfessional(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const current = await requireProfessional(tenantId, req.params.id);
    const data = {};

    if (Object.hasOwn(req.body, "name")) {
      const name = sanitizeText(req.body.name, 80);
      if (!name || name.length < 2) throw createHttpError(400, "Nome do profissional inválido");
      await assertNameAvailable(tenantId, name, current.id);
      data.name = name;
    }
    if (Object.hasOwn(req.body, "specialty")) data.specialty = sanitizeText(req.body.specialty, 120) || "";
    if (Object.hasOwn(req.body, "photo")) data.photo = sanitizeText(req.body.photo, 300) || "";
    if (Object.hasOwn(req.body, "internalContact")) data.internalContact = sanitizeText(req.body.internalContact, 60);
    if (Object.hasOwn(req.body, "displayOrder")) data.displayOrder = parseOrder(req.body.displayOrder);
    if (!Object.keys(data).length) throw createHttpError(400, "Nenhum campo válido para atualizar");

    const professional = await prisma.professional.update({ where: { id: current.id }, data });
    res.json(professional);
  } catch (error) {
    next(error?.code === "P2002" ? createHttpError(409, "Já existe um profissional com esse nome") : error);
  }
}

export async function setProfessionalActive(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const current = await requireProfessional(tenantId, req.params.id);
    if (typeof req.body?.active !== "boolean") throw createHttpError(400, "active inválido");
    const active = req.body.active;

    let appliedImpact = [];
    if (!active && current.active) {
      const affected = await futureAppointments(tenantId, { professionalId: current.id });
      appliedImpact = assertConfirmed(affected, req.body?.confirm, "Existem agendamentos futuros com este profissional");
    }

    const professional = await prisma.professional.update({ where: { id: current.id }, data: { active } });
    res.json({ ...professional, appliedImpact });
  } catch (error) {
    next(error);
  }
}

export async function setProfessionalServices(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const professional = await requireProfessional(tenantId, req.params.id);
    const raw = req.body?.serviceIds;
    if (!Array.isArray(raw)) throw createHttpError(400, "serviceIds inválido");
    const serviceIds = [...new Set(raw.map(sanitizeId))];
    if (serviceIds.some((id) => !id)) throw createHttpError(400, "serviceIds inválido");

    if (serviceIds.length) {
      // Serviço de outro tenant não existe deste lado da sessão.
      const owned = await prisma.service.count({ where: { tenantId, id: { in: serviceIds } } });
      if (owned !== serviceIds.length) throw createHttpError(404, "Serviço não encontrado");
    }

    await prisma.$transaction([
      prisma.professionalService.deleteMany({
        where: { tenantId, professionalId: professional.id, ...(serviceIds.length ? { serviceId: { notIn: serviceIds } } : {}) }
      }),
      ...serviceIds.map((serviceId) => prisma.professionalService.upsert({
        where: { tenantId_professionalId_serviceId: { tenantId, professionalId: professional.id, serviceId } },
        update: {},
        create: { tenantId, professionalId: professional.id, serviceId }
      }))
    ]);

    const links = await prisma.professionalService.findMany({
      where: { tenantId, professionalId: professional.id },
      include: { service: { select: { id: true, name: true, active: true } } },
      orderBy: { serviceId: "asc" }
    });
    res.json({ professionalId: professional.id, services: links.map((link) => link.service) });
  } catch (error) {
    next(error);
  }
}

export async function reorderProfessionals(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const ids = Array.isArray(req.body?.order) ? req.body.order.map(sanitizeId) : null;
    if (!ids || !ids.length || ids.some((id) => !id)) throw createHttpError(400, "Ordem inválida");
    if (new Set(ids).size !== ids.length) throw createHttpError(400, "Ordem com IDs repetidos");

    const owned = await prisma.professional.count({ where: { tenantId, id: { in: ids } } });
    if (owned !== ids.length) throw createHttpError(404, "Profissional não encontrado");

    await prisma.$transaction(ids.map((id, index) => prisma.professional.update({
      where: { id },
      data: { displayOrder: index }
    })));

    const professionals = await prisma.professional.findMany({
      where: { tenantId },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    });
    res.json(professionals);
  } catch (error) {
    next(error);
  }
}

export async function getProfessionalDependencies(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const professional = await requireProfessional(tenantId, req.params.id);
    res.json({
      professionalId: professional.id,
      ...(await professionalDependencies(tenantId, professional.id))
    });
  } catch (error) {
    next(error);
  }
}
