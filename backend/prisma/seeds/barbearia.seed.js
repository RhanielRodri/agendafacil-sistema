import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ERRO: seed bloqueado em produção.");
    process.exit(1);
  }

  await prisma.appointment.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  await Promise.all([
    prisma.service.create({ data: { name: "Corte", description: "Corte social ou degradê.", duration: 30, price: 35 } }),
    prisma.service.create({ data: { name: "Corte + Barba", description: "Corte e alinhamento de barba.", duration: 50, price: 55 } }),
    prisma.service.create({ data: { name: "Barba", description: "Alinhamento e hidratação de barba.", duration: 25, price: 30 } }),
    prisma.service.create({ data: { name: "Corte Infantil", description: "Para até 12 anos.", duration: 25, price: 30 } }),
    prisma.service.create({ data: { name: "Pigmentação de barba", description: "Coloração e preenchimento da barba.", duration: 40, price: 50 } }),
  ]);

  await Promise.all([
    prisma.professional.create({ data: { name: "Carlos", specialty: "Degradê & Barba", photo: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400" } }),
    prisma.professional.create({ data: { name: "Rafael", specialty: "Corte Social & Infantil", photo: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400" } }),
  ]);

  await prisma.businessHours.createMany({
    data: [
      { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isOpen: false },
      { dayOfWeek: 1, openTime: "09:00", closeTime: "19:00", isOpen: true },
      { dayOfWeek: 2, openTime: "09:00", closeTime: "19:00", isOpen: true },
      { dayOfWeek: 3, openTime: "09:00", closeTime: "19:00", isOpen: true },
      { dayOfWeek: 4, openTime: "09:00", closeTime: "19:00", isOpen: true },
      { dayOfWeek: 5, openTime: "09:00", closeTime: "19:00", isOpen: true },
      { dayOfWeek: 6, openTime: "08:00", closeTime: "14:00", isOpen: true },
    ]
  });
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
