import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const toDate = (value) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ERRO: seed bloqueado em produção. Use NODE_ENV=development para rodar o seed localmente.");
    process.exit(1);
  }

  await prisma.appointment.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  const services = await Promise.all([
    prisma.service.create({
      data: {
        name: "Corte masculino",
        description: "Corte completo com acabamento na navalha.",
        duration: 30,
        price: 45
      }
    }),
    prisma.service.create({
      data: {
        name: "Barba completa",
        description: "Toalha quente, desenho e finalização.",
        duration: 30,
        price: 35
      }
    }),
    prisma.service.create({
      data: {
        name: "Corte + barba",
        description: "Combo completo para cabelo e barba.",
        duration: 60,
        price: 75
      }
    }),
    prisma.service.create({
      data: {
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
        name: "Lucas Martins",
        specialty: "Cortes clássicos",
        photo: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=600&q=80"
      }
    }),
    prisma.professional.create({
      data: {
        name: "Rafael Costa",
        specialty: "Barba e degradê",
        photo: "https://images.unsplash.com/photo-1599351431404-433ef72fe40b?auto=format&fit=crop&w=600&q=80"
      }
    }),
    prisma.professional.create({
      data: {
        name: "Bruno Alves",
        specialty: "Corte moderno",
        photo: "https://images.unsplash.com/photo-1582893561942-d61adcb2e534?auto=format&fit=crop&w=600&q=80"
      }
    })
  ]);

  await prisma.businessHours.createMany({
    data: [
      { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isOpen: false },
      { dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 2, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 5, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 6, openTime: "08:00", closeTime: "14:00", isOpen: true }
    ]
  });

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const blocked = new Date(today);
  blocked.setDate(today.getDate() + 7);
  const blockedIso = blocked.toISOString().slice(0, 10);

  await prisma.appointment.createMany({
    data: [
      {
        serviceId: services[0].id,
        professionalId: professionals[0].id,
        clientName: "Marcos Silva",
        clientPhone: "(27) 99999-1111",
        clientEmail: "marcos@email.com",
        date: toDate(todayIso),
        time: "10:00",
        status: "NEW"
      },
      {
        serviceId: services[2].id,
        professionalId: professionals[1].id,
        clientName: "Pedro Lima",
        clientPhone: "(27) 99999-2222",
        clientEmail: "pedro@email.com",
        date: toDate(todayIso),
        time: "14:00",
        status: "CONFIRMED"
      },
      {
        serviceId: services[1].id,
        professionalId: professionals[2].id,
        clientName: "André Souza",
        clientPhone: "(27) 99999-3333",
        clientEmail: "andre@email.com",
        date: toDate(tomorrowIso),
        time: "11:30",
        status: "COMPLETED"
      }
    ]
  });

  await prisma.blockedDate.create({
    data: {
      date: toDate(blockedIso),
      reason: "Treinamento interno"
    }
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
