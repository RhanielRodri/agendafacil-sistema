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
    prisma.service.create({ data: { name: "Corte feminino", description: "Corte com lavagem e finalização.", duration: 60, price: 80 } }),
    prisma.service.create({ data: { name: "Escova progressiva", description: "Progressiva com alinhamento e brilho intenso.", duration: 120, price: 180 } }),
    prisma.service.create({ data: { name: "Coloração", description: "Coloração completa com hidratação inclusa.", duration: 90, price: 150 } }),
    prisma.service.create({ data: { name: "Escova modeladora", description: "Escova com cachos ou liso, finalização profissional.", duration: 60, price: 70 } }),
    prisma.service.create({ data: { name: "Manicure", description: "Esmaltação simples ou em gel.", duration: 45, price: 40 } }),
    prisma.service.create({ data: { name: "Pedicure", description: "Cuidado completo dos pés com esmaltação.", duration: 50, price: 50 } }),
    prisma.service.create({ data: { name: "Sobrancelha", description: "Design com linha e henna ou pigmentação.", duration: 30, price: 35 } }),
  ]);

  await Promise.all([
    prisma.professional.create({ data: { name: "Ana Paula", specialty: "Coloração & Progressiva", photo: "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=400" } }),
    prisma.professional.create({ data: { name: "Camila Reis", specialty: "Corte & Escova", photo: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400" } }),
    prisma.professional.create({ data: { name: "Juliana Costa", specialty: "Manicure & Pedicure", photo: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400" } }),
  ]);

  await prisma.businessHours.createMany({
    data: [
      { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isOpen: false },
      { dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 2, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 5, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { dayOfWeek: 6, openTime: "08:00", closeTime: "15:00", isOpen: true },
    ]
  });
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
