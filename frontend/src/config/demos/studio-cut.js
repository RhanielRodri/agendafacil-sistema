const studioCut = {
  slug: "studio-cut",
  name: "Studio Cut",
  segment: "Barbearia",
  city: "Vila Velha, ES",
  schedule: "Seg a Sáb",
  logo: {
    mark: "SC",
    background: "#111111",
    foreground: "#ffffff"
  },
  metadata: {
    title: "Studio Cut | Barbearia em Vila Velha",
    description: "Escolha seu serviço, profissional e horário na Studio Cut.",
    themeColor: "#111111",
    image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80",
    canonical: "https://studio-cut-public.sor-os-demos.workers.dev"
  },
  hero: {
    eyebrow: "Barbearia · Vila Velha, ES",
    headline: ["PRECISÃO", "NO", "CORTE."],
    sub: "Escolha o serviço, o profissional e o melhor horário para cuidar do seu visual.",
    primaryCta: "Agendar horário",
    secondaryCta: "Conhecer serviços",
    highlights: ["Corte e barba", "Agendamento online", "Seg a Sáb"],
    image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Interior da barbearia Studio Cut",
    badge: "Consulte a agenda abaixo"
  },
  details: {
    eyebrow: "A experiência",
    title: "Direto ao ponto, do jeito que uma boa barbearia deve ser",
    items: [
      { title: "Escolha simples", text: "Serviços, profissionais e horários reunidos em um único fluxo." },
      { title: "Atendimento organizado", text: "Seu pedido chega com serviço, data e horário já definidos." },
      { title: "Rotina prática", text: "Consulte as opções disponíveis sem depender de troca de mensagens." }
    ]
  },
  process: {
    eyebrow: "Como funciona",
    title: "Seu horário em poucos passos",
    items: [
      { number: "01", title: "Escolha o serviço", text: "Veja as opções disponíveis e selecione o cuidado que procura." },
      { number: "02", title: "Defina profissional e horário", text: "Escolha quem vai atender e consulte a agenda disponível." },
      { number: "03", title: "Confirme seus dados", text: "Informe seus dados para concluir a solicitação de agendamento." }
    ]
  },
  space: {
    eyebrow: "O espaço",
    title: "Onde o corte acontece",
    description: ["Uma barbearia com atendimento organizado e foco em corte, barba e acabamento."],
    image: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1400&q=80",
    imageAlt: "Espaço interno da barbearia Studio Cut"
  },
  copy: {
    servicesEyebrow: "Serviços",
    servicesTitle: "Escolha o seu próximo cuidado",
    professionalsEyebrow: "Profissionais",
    professionalsTitle: "Quem cuida do seu estilo"
  },
  footer: {
    tagline: "Corte, barba e agendamento online"
  },
  whatsapp: {
    templates: {
      confirmation: "Olá {cliente}! Seu horário na {negocio} está confirmado: {servico} em {data} às {hora}. Até lá!",
      reminder: "Olá {cliente}! Lembrete do seu horário na {negocio}: {servico} amanhã, {data} às {hora}.",
      return: "Olá {cliente}! Já faz um tempo desde seu último {servico} na {negocio}. Quer marcar um novo horário?",
      reschedule: "Olá {cliente}! Precisamos ajustar seu horário de {servico} em {data} às {hora}. Qual outro horário fica melhor para você?",
      quote: "Olá {cliente}! Sobre o {servico} na {negocio}: posso te passar os detalhes e valores. Quando prefere ser atendido?",
      initialContact: "Olá {cliente}! Aqui é da {negocio}. Recebemos seu contato e queremos ajudar a agendar seu horário."
    }
  }
};

export default studioCut;
