const lumiere = {
  slug: "lumiere",
  name: "Lumière Estética",
  segment: "Clínica de estética",
  city: "Vila Velha, ES",
  schedule: "Seg a Sáb",
  logo: {
    mark: "L",
    background: "#c9a97a",
    foreground: "#2c2420"
  },
  metadata: {
    title: "Lumière Estética | Cuidados em Vila Velha",
    description: "Agende seu horário para cuidados faciais e corporais na Lumière Estética.",
    themeColor: "#faf8f5",
    image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80",
    canonical: "https://lumiere-public.sor-os-demos.workers.dev"
  },
  hero: {
    eyebrow: "Estética e cuidado · Vila Velha, ES",
    headline: ["CUIDADO", "EM CADA", "DETALHE."],
    sub: "Escolha seu tratamento e reserve um momento pensado para cuidado e atendimento individual.",
    primaryCta: "Agendar avaliação",
    secondaryCta: "Conhecer tratamentos",
    highlights: ["Atendimento individual", "Cuidados faciais e corporais", "Seg a Sáb"],
    image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Ambiente de cuidado da Lumière Estética",
    badge: "Consulte a agenda abaixo"
  },
  details: {
    eyebrow: "Cuidados e confiança",
    title: "Uma experiência tranquila desde a escolha do tratamento",
    items: [
      { title: "Atendimento individual", text: "Cada agendamento começa com a escolha do cuidado e da profissional." },
      { title: "Informações claras", text: "Tratamentos, duração e horários aparecem antes da confirmação." },
      { title: "Escolha no seu tempo", text: "Consulte a agenda e selecione a opção adequada para sua rotina." }
    ]
  },
  process: {
    eyebrow: "Processo de atendimento",
    title: "Do cuidado escolhido ao horário reservado",
    items: [
      { number: "01", title: "Escolha o tratamento", text: "Consulte as opções disponíveis para cuidados faciais e corporais." },
      { number: "02", title: "Selecione a profissional", text: "Veja a equipe e escolha com quem deseja realizar o atendimento." },
      { number: "03", title: "Reserve o horário", text: "Defina data, horário e dados de contato para enviar sua solicitação." }
    ]
  },
  space: {
    eyebrow: "A clínica",
    title: "Leveza e atenção em cada etapa",
    description: ["Um ambiente voltado para cuidado, conforto e atendimento individual.", "A escolha do tratamento e do horário acontece de forma simples e transparente."],
    image: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1400&q=80",
    imageAlt: "Espaço de atendimento da Lumière Estética"
  },
  copy: {
    servicesEyebrow: "Tratamentos",
    servicesTitle: "Cuidados para diferentes momentos",
    professionalsEyebrow: "Equipe",
    professionalsTitle: "Profissionais que acompanham seu atendimento"
  },
  footer: {
    tagline: "Cuidado e atendimento individual"
  },
  whatsapp: {
    templates: {
      confirmation: "Olá {cliente}! Sua avaliação na {negocio} está confirmada: {servico} em {data} às {hora}. Até breve!",
      reminder: "Olá {cliente}! Lembrete do seu atendimento na {negocio}: {servico} amanhã, {data} às {hora}.",
      return: "Olá {cliente}! Que tal cuidar de você novamente? Podemos agendar um novo {servico} na {negocio}.",
      reschedule: "Olá {cliente}! Precisamos reagendar seu {servico} de {data} às {hora}. Qual outro horário fica melhor para você?",
      quote: "Olá {cliente}! Sobre o {servico} na {negocio}: posso te enviar os detalhes e valores. Quando prefere ser atendida?",
      initialContact: "Olá {cliente}! Aqui é da {negocio}. Recebemos seu contato e vamos ajudar a agendar seu atendimento."
    }
  }
};

// Camada de apresentação só-frontend (ver nota em studio-cut.js). Export
// nomeado, fora do contrato do pack e do bundle da outra vertical.
export const presentation = {
  faviconVariant: "serif",
  fonts: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap",
  nav: [
    { label: "Início", href: "#topo" },
    { label: "Tratamentos", href: "#servicos" },
    { label: "Profissionais", href: "#profissionais" },
    { label: "Experiência", href: "#galeria" },
    { label: "Avaliações", href: "#avaliacoes" },
    { label: "Contato", href: "#contato" }
  ],
  hero: {
    sub: "Cuidados faciais e corporais com atendimento individual. Reserve um momento pensado para segurança, conforto e resultado natural.",
    secondaryCta: "Ver tratamentos",
    highlights: ["Atendimento individual", "Avaliação personalizada", "Seg a Sáb"],
    image: "/assets/hero.jpg",
    imageAlt: "Profissional em atendimento estético na Lumière",
    badge: "Avaliações disponíveis esta semana"
  },
  differentials: {
    items: [
      { title: "Profissionais qualificadas", text: "Equipe preparada para cada tipo de cuidado." },
      { title: "Atendimento personalizado", text: "Cada avaliação considera o seu momento." },
      { title: "Tecnologia adequada", text: "Recursos escolhidos para conforto e segurança." },
      { title: "Ambiente acolhedor", text: "Um espaço tranquilo do início ao fim." }
    ]
  },
  gallery: {
    eyebrow: "Experiência",
    title: "O ambiente e o cuidado",
    items: [
      { src: "/assets/gallery/4.jpg", alt: "Recepção acolhedora da clínica", label: "Espaço" },
      { src: "/assets/gallery/3.jpg", alt: "Sala de atendimento", label: "Salas" },
      { src: "/assets/gallery/1.jpg", alt: "Procedimento facial em andamento", label: "Procedimentos" },
      { src: "/assets/gallery/5.jpg", alt: "Cuidado facial detalhado", label: "Atendimento" },
      { src: "/assets/gallery/2.jpg", alt: "Detalhe de produtos e cuidado", label: "Detalhes" }
    ]
  },
  reviews: {
    eyebrow: "Avaliações",
    title: "Quem já se cuidou na Lumière",
    note: "Depoimentos demonstrativos, para ilustrar a experiência.",
    items: [
      { name: "A. C.", role: "Limpeza de pele", rating: 5, text: "Atendimento atencioso do começo ao fim. Saí com a pele renovada e me senti segura." },
      { name: "M. F.", role: "Avaliação facial", rating: 5, text: "Explicaram cada etapa com calma. Resultado natural, exatamente como eu queria." },
      { name: "P. R.", role: "Cuidado corporal", rating: 5, text: "Ambiente tranquilo e profissionais que realmente escutam. Agendei pelo site em minutos." }
    ]
  },
  space: {
    image: "/assets/space.jpg",
    location: "Praia da Costa · Vila Velha, ES",
    hours: ["Seg a Sex · 9h às 19h", "Sábado · 9h às 14h"]
  },
  professionals: {
    "professional-lumiere-1": {
      name: "Marina Costa",
      specialty: "Cuidados faciais e avaliação",
      bio: "Especialista em protocolos faciais e avaliação personalizada de pele.",
      photo: "/assets/professionals/lumiere-1.jpg"
    },
    "professional-lumiere-2": {
      name: "Camila Ribeiro",
      specialty: "Procedimentos corporais",
      bio: "Focada em resultado natural e no conforto durante todo o atendimento.",
      photo: "/assets/professionals/lumiere-2.jpg"
    }
  },
  contact: {
    title: "Prefere conversar antes de reservar?",
    description: "Solicite uma avaliação ou conte qual cuidado procura. Retornamos com atenção.",
    actions: [
      { label: "Solicitar avaliação", source: "EVALUATION" },
      { label: "Tirar uma dúvida", source: "CONTACT" }
    ]
  }
};

export default lumiere;
