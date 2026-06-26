export const SERVICES = [
  {
    id: 1,
    name: "Limpeza de Pele",
    description: "Protocolo de limpeza profunda com extração, esfoliação enzimática e hidratação intensiva. Indicado para todos os tipos de pele.",
    price: 180,
    duration: 60,
  },
  {
    id: 2,
    name: "Harmonização Facial",
    description: "Procedimento com bioestimuladores e preenchimento para realçar seus traços naturais com resultado discreto e elegante.",
    price: 1200,
    duration: 90,
  },
  {
    id: 3,
    name: "Drenagem Linfática",
    description: "Massagem modeladora que reduz inchaço, melhora a circulação e define a silhueta. Sessão corporal completa.",
    price: 150,
    duration: 50,
  },
];

export const PROFESSIONALS = [
  {
    id: 1,
    name: "Dra. Beatriz Moura",
    specialty: "Skincare & Procedimentos Faciais",
    photo: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400",
  },
  {
    id: 2,
    name: "Dra. Camila Lins",
    specialty: "Harmonização Facial & Bioestimuladores",
    photo: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400",
  },
  {
    id: 3,
    name: "Fernanda Costa",
    specialty: "Terapeuta Corporal & Drenagem",
    photo: "https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=400",
  },
];

const ALL_SLOTS = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];

export function getMockSlots(date) {
  const today = new Date().toISOString().slice(0, 10);
  if (date !== today) return ALL_SLOTS;
  const nowHour = new Date().getHours();
  return ALL_SLOTS.filter((slot) => parseInt(slot) > nowHour);
}

export function createMockAppointment({ serviceId, professionalId, date, time, clientName }) {
  const service = SERVICES.find((s) => s.id === Number(serviceId));
  const professional = PROFESSIONALS.find((p) => p.id === Number(professionalId));
  return Promise.resolve({
    id: Math.floor(Math.random() * 9000) + 1000,
    service,
    professional,
    date,
    time,
    clientName,
    status: "pending",
  });
}
