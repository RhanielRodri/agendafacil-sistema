import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password.js";

const prisma = new PrismaClient();

const toDate = (value) => new Date(`${value}T00:00:00.000Z`);

const STUDIO_CUT = "studio-cut";
const LUMIERE = "lumiere";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ERRO: seed bloqueado em produção. Use NODE_ENV=development para rodar o seed localmente.");
    process.exit(1);
  }

  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.relationshipHistoryEvent.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.appointment.updateMany({ data: { leadId: null } });
  await prisma.lead.updateMany({ data: { convertedAppointmentId: null } });
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.client.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.professionalSchedule.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  await prisma.tenant.upsert({
    where: { slug: STUDIO_CUT },
    update: { name: "Studio Cut", active: true },
    create: { slug: STUDIO_CUT, name: "Studio Cut", active: true }
  });
  await prisma.tenant.upsert({
    where: { slug: LUMIERE },
    update: { name: "Lumière Estética", active: true },
    create: { slug: LUMIERE, name: "Lumière Estética", active: true }
  });

  // Usuários administrativos locais, idempotentes, a partir de variáveis
  // ignoradas pelo Git. Sem senha em texto puro no código ou no banco.
  const adminSeeds = [
    { tenantId: STUDIO_CUT, name: "Administração Studio Cut", email: process.env.STUDIO_CUT_ADMIN_EMAIL, password: process.env.STUDIO_CUT_ADMIN_PASSWORD },
    { tenantId: LUMIERE, name: "Administração Lumière", email: process.env.LUMIERE_ADMIN_EMAIL, password: process.env.LUMIERE_ADMIN_PASSWORD }
  ];

  for (const admin of adminSeeds) {
    if (!admin.email || !admin.password) {
      console.warn(`seed: credenciais admin de ${admin.tenantId} ausentes no .env local; usuário não criado.`);
      continue;
    }
    const email = admin.email.trim().toLowerCase();
    const passwordHash = await hashPassword(admin.password);
    await prisma.adminUser.upsert({
      where: { tenantId_email: { tenantId: admin.tenantId, email } },
      update: { passwordHash, name: admin.name, active: true },
      create: { tenantId: admin.tenantId, email, name: admin.name, passwordHash, active: true }
    });
  }

  const services = await Promise.all([
    prisma.service.create({
      data: {
        tenantId: STUDIO_CUT,
        name: "Corte masculino",
        description: "Corte completo com acabamento na navalha.",
        duration: 30,
        price: 45
      }
    }),
    prisma.service.create({
      data: {
        tenantId: STUDIO_CUT,
        name: "Barba completa",
        description: "Toalha quente, desenho e finalização.",
        duration: 30,
        price: 35
      }
    }),
    prisma.service.create({
      data: {
        tenantId: STUDIO_CUT,
        name: "Corte + barba",
        description: "Combo completo para cabelo e barba.",
        duration: 60,
        price: 75
      }
    }),
    prisma.service.create({
      data: {
        tenantId: STUDIO_CUT,
        name: "Sobrancelha",
        description: "Design rápido com acabamento natural.",
        duration: 30,
        price: 20
      }
    })
  ]);

  const professionals = await Promise.all([
    prisma.professional.create({
      data: {
        tenantId: STUDIO_CUT,
        name: "Lucas Martins",
        specialty: "Cortes clássicos",
        photo: "https://images.unsplash.com/photo-1605980776566-0486c3ac7617?auto=format&fit=crop&w=800&q=80"
      }
    }),
    prisma.professional.create({
      data: {
        tenantId: STUDIO_CUT,
        name: "Rafael Costa",
        specialty: "Barba e degradê",
        photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80"
      }
    }),
    prisma.professional.create({
      data: {
        tenantId: STUDIO_CUT,
        name: "Bruno Alves",
        specialty: "Corte moderno",
        photo: "https://images.unsplash.com/photo-1582893561942-d61adcb2e534?auto=format&fit=crop&w=800&q=80"
      }
    })
  ]);

  const lumiereServices = await Promise.all([
    prisma.service.create({
      data: {
        tenantId: LUMIERE,
        name: "Limpeza de pele",
        description: "Limpeza profunda com extração, esfoliação e hidratação.",
        duration: 60,
        price: 180
      }
    }),
    prisma.service.create({
      data: {
        tenantId: LUMIERE,
        name: "Harmonização facial",
        description: "Procedimento personalizado para realçar os traços com naturalidade.",
        duration: 90,
        price: 1200
      }
    }),
    prisma.service.create({
      data: {
        tenantId: LUMIERE,
        name: "Drenagem linfática",
        description: "Massagem corporal para reduzir inchaço e melhorar a circulação.",
        duration: 60,
        price: 150
      }
    })
  ]);

  const lumiereProfessionals = await Promise.all([
    prisma.professional.create({
      data: {
        tenantId: LUMIERE,
        name: "Beatriz Moura",
        specialty: "Skincare e procedimentos faciais",
        photo: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=800&q=80"
      }
    }),
    prisma.professional.create({
      data: {
        tenantId: LUMIERE,
        name: "Camila Lins",
        specialty: "Harmonização facial e bioestimuladores",
        photo: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=800&q=80"
      }
    }),
    prisma.professional.create({
      data: {
        tenantId: LUMIERE,
        name: "Fernanda Costa",
        specialty: "Terapia corporal e drenagem",
        photo: "https://images.unsplash.com/photo-1651008376811-b90baee60c1f?auto=format&fit=crop&w=800&q=80"
      }
    })
  ]);

  // Horários independentes por tenant.
  await prisma.businessHours.createMany({
    data: [
      { tenantId: STUDIO_CUT, dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isOpen: false },
      { tenantId: STUDIO_CUT, dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: STUDIO_CUT, dayOfWeek: 2, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: STUDIO_CUT, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: STUDIO_CUT, dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: STUDIO_CUT, dayOfWeek: 5, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: STUDIO_CUT, dayOfWeek: 6, openTime: "08:00", closeTime: "14:00", isOpen: true },
      { tenantId: LUMIERE, dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isOpen: false },
      { tenantId: LUMIERE, dayOfWeek: 1, openTime: "00:00", closeTime: "00:00", isOpen: false },
      { tenantId: LUMIERE, dayOfWeek: 2, openTime: "10:00", closeTime: "19:00", isOpen: true },
      { tenantId: LUMIERE, dayOfWeek: 3, openTime: "10:00", closeTime: "19:00", isOpen: true },
      { tenantId: LUMIERE, dayOfWeek: 4, openTime: "10:00", closeTime: "19:00", isOpen: true },
      { tenantId: LUMIERE, dayOfWeek: 5, openTime: "10:00", closeTime: "19:00", isOpen: true },
      { tenantId: LUMIERE, dayOfWeek: 6, openTime: "10:00", closeTime: "16:00", isOpen: true }
    ]
  });

  const openHours = await prisma.businessHours.findMany({ where: { isOpen: true } });
  const allProfessionals = [...professionals, ...lumiereProfessionals];
  await prisma.professionalSchedule.createMany({
    data: allProfessionals.flatMap((professional) =>
      openHours
        .filter((hours) => hours.tenantId === professional.tenantId)
        .map((hours) => ({
          tenantId: professional.tenantId,
          professionalId: professional.id,
          dayOfWeek: hours.dayOfWeek,
          startTime: hours.openTime,
          endTime: hours.closeTime,
          active: true
        }))
    )
  });

  await prisma.professionalSchedule.deleteMany({
    where: {
      OR: [
        { professionalId: professionals[0].id, dayOfWeek: 1 },
        { professionalId: lumiereProfessionals[0].id, dayOfWeek: 4 }
      ]
    }
  });
  await prisma.professionalSchedule.createMany({
    data: [
      { tenantId: STUDIO_CUT, professionalId: professionals[0].id, dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
      { tenantId: STUDIO_CUT, professionalId: professionals[0].id, dayOfWeek: 1, startTime: "13:00", endTime: "17:00" },
      { tenantId: LUMIERE, professionalId: lumiereProfessionals[0].id, dayOfWeek: 4, startTime: "11:00", endTime: "14:00" },
      { tenantId: LUMIERE, professionalId: lumiereProfessionals[0].id, dayOfWeek: 4, startTime: "15:00", endTime: "19:00" }
    ]
  });

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const studioBlocked = new Date(today);
  studioBlocked.setDate(today.getDate() + 7);
  const studioBlockedIso = studioBlocked.toISOString().slice(0, 10);
  const lumiereBlocked = new Date(today);
  lumiereBlocked.setDate(today.getDate() + 10);
  const lumiereBlockedIso = lumiereBlocked.toISOString().slice(0, 10);
  const studioPartial = new Date(today);
  studioPartial.setDate(today.getDate() + 14);
  const studioPartialIso = studioPartial.toISOString().slice(0, 10);
  const lumierePartial = new Date(today);
  lumierePartial.setDate(today.getDate() + 17);
  const lumierePartialIso = lumierePartial.toISOString().slice(0, 10);

  await prisma.client.createMany({
    data: [
      { tenantId: STUDIO_CUT, name: "Marcos Silva", phone: "(27) 99999-1111", normalizedPhone: "27999991111", email: "marcos@email.com", normalizedEmail: "marcos@email.com" },
      { tenantId: STUDIO_CUT, name: "Pedro Lima", phone: "(27) 99999-2222", normalizedPhone: "27999992222", email: "pedro@email.com", normalizedEmail: "pedro@email.com" },
      { tenantId: STUDIO_CUT, name: "André Souza", phone: "(27) 99999-3333", normalizedPhone: "27999993333", email: "andre@email.com", normalizedEmail: "andre@email.com" },
      { tenantId: LUMIERE, name: "Juliana Prado", phone: "(27) 98888-4444", normalizedPhone: "27988884444", email: "juliana@email.com", normalizedEmail: "juliana@email.com" }
    ]
  });
  const seededClients = await prisma.client.findMany();
  const clientByPhone = Object.fromEntries(seededClients.map((client) => [
    `${client.tenantId}:${client.normalizedPhone}`,
    client
  ]));

  await prisma.appointment.createMany({
    data: [
      {
        tenantId: STUDIO_CUT,
        serviceId: services[0].id,
        professionalId: professionals[0].id,
        clientId: clientByPhone[`${STUDIO_CUT}:27999991111`].id,
        clientName: "Marcos Silva",
        clientPhone: "(27) 99999-1111",
        clientEmail: "marcos@email.com",
        date: toDate(todayIso),
        time: "10:00",
        status: "PENDING"
      },
      {
        tenantId: STUDIO_CUT,
        serviceId: services[2].id,
        professionalId: professionals[1].id,
        clientId: clientByPhone[`${STUDIO_CUT}:27999992222`].id,
        clientName: "Pedro Lima",
        clientPhone: "(27) 99999-2222",
        clientEmail: "pedro@email.com",
        date: toDate(todayIso),
        time: "14:00",
        status: "CONFIRMED"
      },
      {
        tenantId: STUDIO_CUT,
        serviceId: services[1].id,
        professionalId: professionals[2].id,
        clientId: clientByPhone[`${STUDIO_CUT}:27999993333`].id,
        clientName: "André Souza",
        clientPhone: "(27) 99999-3333",
        clientEmail: "andre@email.com",
        date: toDate(tomorrowIso),
        time: "11:30",
        status: "COMPLETED"
      },
      {
        tenantId: LUMIERE,
        serviceId: lumiereServices[0].id,
        professionalId: lumiereProfessionals[0].id,
        clientId: clientByPhone[`${LUMIERE}:27988884444`].id,
        clientName: "Juliana Prado",
        clientPhone: "(27) 98888-4444",
        clientEmail: "juliana@email.com",
        date: toDate(tomorrowIso),
        time: "10:00",
        status: "PENDING"
      }
    ]
  });

  const seededAppointments = await prisma.appointment.findMany();
  await prisma.appointmentHistoryEvent.createMany({
    data: seededAppointments.map((appointment) => ({
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      type: "STATUS_CHANGED",
      toStatus: appointment.status,
      metadata: { source: "SEED" },
      actorType: "SYSTEM"
    }))
  });
  await prisma.relationshipHistoryEvent.createMany({
    data: [
      ...seededClients.map((client) => ({
        tenantId: client.tenantId,
        clientId: client.id,
        type: "CLIENT_CREATED",
        actorType: "SYSTEM",
        metadata: { source: "SEED" }
      })),
      ...seededAppointments.map((appointment) => ({
        tenantId: appointment.tenantId,
        clientId: appointment.clientId,
        appointmentId: appointment.id,
        type: "APPOINTMENT_LINKED",
        actorType: "SYSTEM",
        metadata: { source: "SEED" }
      }))
    ]
  });

  await prisma.scheduleBlock.createMany({
    data: [
      { tenantId: STUDIO_CUT, date: toDate(studioBlockedIso), allDay: true, reason: "Treinamento interno" },
      { tenantId: LUMIERE, date: toDate(lumiereBlockedIso), allDay: true, reason: "Feriado interno" },
      { tenantId: STUDIO_CUT, date: toDate(studioPartialIso), startTime: "12:00", endTime: "12:30", reason: "Pausa geral" },
      { tenantId: STUDIO_CUT, professionalId: professionals[0].id, date: toDate(studioPartialIso), startTime: "15:00", endTime: "16:00", reason: "Compromisso do profissional" },
      { tenantId: LUMIERE, date: toDate(lumierePartialIso), startTime: "13:30", endTime: "14:00", reason: "Pausa da clínica" },
      { tenantId: LUMIERE, professionalId: lumiereProfessionals[0].id, date: toDate(lumierePartialIso), startTime: "16:00", endTime: "17:00", reason: "Procedimento interno" }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
