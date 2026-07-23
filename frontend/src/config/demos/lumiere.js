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

export default lumiere;
