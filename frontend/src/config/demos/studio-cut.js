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
  faviconVariant: "barber",
  brandSymbol: true,
  wordmark: "STUDIO CUT",
  logo: {
    mark: "SC",
    background: "#171411",
    foreground: "#c59a5c"
  },
  metadata: {
    title: "Studio Cut | Barbearia premium em Vila Velha",
    description: "Corte, barba e acabamento com hora marcada na Praia da Costa. Escolha o barbeiro e reserve online.",
    themeColor: "#171411",
    image: "https://studio-cut-public.sor-os-demos.workers.dev/assets/hero.jpg"
  },
  fonts: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap",
  nav: [
    { label: "Serviços", href: "#servicos" },
    { label: "Barbeiros", href: "#profissionais" },
    { label: "Galeria", href: "#galeria" },
    { label: "Agendar", href: "#agendamento" }
  ],
  hero: {
    eyebrow: "Barbearia de precisão · Praia da Costa",
    headline: ["CORTE CERTO.", "HORA", "MARCADA."],
    sub: "Escolha corte, barba ou combo, veja a agenda dos barbeiros e reserve em poucos passos.",
    secondaryCta: "Ver serviços",
    highlights: ["Corte, barba e acabamento", "Agenda em tempo real", "Seg a Sáb"],
    image: "/assets/hero.jpg",
    imageAlt: "Barbeiro finalizando um corte na Studio Cut",
    badge: "Horários disponíveis"
  },
  differentials: {
    items: [
      { title: "Técnica precisa", text: "Corte, barba e acabamento com atenção aos detalhes." },
      { title: "Produtos profissionais", text: "Finalização escolhida para o seu estilo e rotina." },
      { title: "Hora marcada", text: "Agenda real, escolha direta e menos espera." },
      { title: "Ambiente autoral", text: "Carvão, couro e metal em uma experiência sem excessos." }
    ]
  },
  copy: {
    servicesEyebrow: "Serviços essenciais",
    servicesTitle: "Corte, barba e acabamento sem improviso",
    professionalsEyebrow: "Na cadeira",
    professionalsTitle: "Escolha quem assina o seu corte"
  },
  process: {
    eyebrow: "Reserva direta",
    title: "Do serviço à cadeira em três passos"
  },
  gallery: {
    eyebrow: "Precisão em cena",
    title: "Técnica, ferramentas e ambiente",
    items: [
      { src: "/assets/gallery/v2/precision-fade.webp", alt: "Degradê masculino finalizado com precisão", label: "Degradê" },
      { src: "/assets/gallery/v2/beard-razor.webp", alt: "Barba sendo alinhada com navalha", label: "Barba" },
      { src: "/assets/gallery/v2/barber-service.webp", alt: "Barbeiro realizando corte com tesoura e pente", label: "Técnica" },
      { src: "/assets/gallery/v2/tools.webp", alt: "Ferramentas profissionais preparadas para o atendimento", label: "Ferramentas" },
      { src: "/assets/gallery/v2/interior.webp", alt: "Interior contemporâneo de barbearia em carvão e latão", label: "Ambiente" }
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
    eyebrow: "Studio Cut",
    title: "Um espaço pensado para fazer bem feito",
    description: ["Atendimento com hora marcada, ferramentas profissionais e um ambiente sóbrio para corte, barba e acabamento."],
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
    title: "Seu horário ideal não apareceu?",
    description: "Entre na lista de espera ou peça um encaixe. A equipe retorna com as opções possíveis.",
    actions: [
      { label: "Entrar na lista de espera", source: "WAITLIST" },
      { label: "Solicitar encaixe", source: "WAITLIST", urgency: "TODAY" },
      { label: "Falar com a equipe", source: "CONTACT" }
    ]
  }
};

export default studioCut;
