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

// Camada de apresentação só-frontend: navegação, imagens locais, galeria,
// avaliações e overrides de retrato. NÃO faz parte do contrato do Client Pack
// (por isso é export nomeado, invisível ao gate de paridade `default`), e o
// deployment fixado por vertical mantém isto fora do bundle da outra demo.
export const presentation = {
  faviconVariant: "block",
  fonts: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap",
  nav: [
    { label: "Início", href: "#topo" },
    { label: "Serviços", href: "#servicos" },
    { label: "Barbeiros", href: "#profissionais" },
    { label: "Galeria", href: "#galeria" },
    { label: "Sobre", href: "#espaco" },
    { label: "Avaliações", href: "#avaliacoes" }
  ],
  hero: {
    headline: ["PRECISÃO", "EM CADA", "CORTE."],
    sub: "Corte, barba e acabamento com hora marcada. Escolha o serviço, o barbeiro e o horário sem depender de mensagem.",
    secondaryCta: "Ver serviços",
    highlights: ["Barbeiros experientes", "Agendamento online", "Seg a Sáb"],
    image: "/assets/hero.jpg",
    imageAlt: "Barbeiro finalizando um corte na Studio Cut",
    badge: "Agenda aberta esta semana"
  },
  differentials: {
    items: [
      { title: "Barbeiros experientes", text: "Equipe especializada em corte, barba e acabamento." },
      { title: "Produtos premium", text: "Linha profissional para finalização que dura." },
      { title: "Agendamento online", text: "Escolha horário sem troca de mensagens." },
      { title: "Ambiente preparado", text: "Estrutura pensada para um atendimento tranquilo." }
    ]
  },
  gallery: {
    eyebrow: "Galeria",
    title: "O trabalho de perto",
    items: [
      { src: "/assets/gallery/1.jpg", alt: "Corte masculino finalizado", label: "Cortes" },
      { src: "/assets/gallery/5.jpg", alt: "Barbeiro em atendimento", label: "Atendimento" },
      { src: "/assets/gallery/2.jpg", alt: "Acabamento de barba", label: "Barba" },
      { src: "/assets/gallery/3.jpg", alt: "Detalhe de acabamento", label: "Acabamento" },
      { src: "/assets/gallery/4.jpg", alt: "Ambiente da barbearia", label: "Ambiente" }
    ]
  },
  reviews: {
    eyebrow: "Avaliações",
    title: "O que dizem sobre a Studio Cut",
    note: "Depoimentos demonstrativos, para ilustrar a experiência.",
    items: [
      { name: "R. M.", role: "Corte + barba", rating: 5, text: "Agendei em um minuto e fui atendido na hora marcada. Acabamento impecável." },
      { name: "L. S.", role: "Degradê", rating: 5, text: "Melhor degradê que já fiz na região. Ambiente tranquilo e atendimento rápido." },
      { name: "T. A.", role: "Barba", rating: 5, text: "Marquei pelo site, sem enrolação. Voltei e virei cliente fixo." }
    ]
  },
  space: {
    image: "/assets/space.jpg",
    location: "Praia da Costa · Vila Velha, ES",
    hours: ["Seg a Sex · 9h às 18h", "Sábado · 8h às 14h"]
  },
  professionals: {
    "professional-studio-1": {
      name: "Rafael Antunes",
      specialty: "Cortes clássicos e navalha",
      bio: "Especializado em cortes clássicos e acabamento na navalha.",
      photo: "/assets/professionals/studio-1.jpg"
    },
    "professional-studio-2": {
      name: "Diego Moraes",
      specialty: "Degradê e barba",
      bio: "Referência em degradê e desenho de barba, com atendimento preciso.",
      photo: "/assets/professionals/studio-2.jpg"
    }
  },
  contact: {
    title: "Não encontrou o horário ideal?",
    description: "Entre na lista de espera, peça um encaixe ou fale direto com a equipe.",
    actions: [
      { label: "Entrar na lista de espera", source: "WAITLIST" },
      { label: "Solicitar encaixe", source: "WAITLIST", urgency: "TODAY" },
      { label: "Falar com a equipe", source: "CONTACT" }
    ]
  }
};

export default studioCut;
