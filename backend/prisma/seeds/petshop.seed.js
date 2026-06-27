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
    prisma.service.create({ data: { name: "Banho — Pequeno porte", description: "Até 10kg. Banho com shampoo e condicionador.", duration: 60, price: 50 } }),
    prisma.service.create({ data: { name: "Banho — Médio porte", description: "10 a 20kg. Banho com shampoo e condicionador.", duration: 75, price: 70 } }),
    prisma.service.create({ data: { name: "Banho — Grande porte", description: "Acima de 20kg. Banho completo.", duration: 90, price: 95 } }),
    prisma.service.create({ data: { name: "Banho + Tosa higiênica", description: "Banho e tosa das áreas sensíveis.", duration: 90, price: 80 } }),
    prisma.service.create({ data: { name: "Banho + Tosa completa", description: "Banho e tosa completa no padrão da raça.", duration: 120, price: 120 } }),
    prisma.service.create({ data: { name: "Tosa completa", description: "Tosa no padrão da raça, sem banho.", duration: 60, price: 70 } }),
  ]);

  await Promise.all([
    prisma.professional.create({ data: { name: "Fernanda Lima", specialty: "Tosa e Banho", photo: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400" } }),
    prisma.professional.create({ data: { name: "Ricardo Nunes", specialty: "Tosa de raças grandes", photo: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400" } }),
  ]);

  await prisma.businessHours.createMany({
    data: [
      { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isOpen: false },
      { dayOfWeek: 1, openTime: "08:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 2, openTime: "08:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 3, openTime: "08:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 4, openTime: "08:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 5, openTime: "08:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 6, openTime: "08:00", closeTime: "13:00", isOpen: true },
    ]
  });
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
