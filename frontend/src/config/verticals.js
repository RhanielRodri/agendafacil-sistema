// Diferenças por vertical: o núcleo visual é o mesmo, mas a operação diária
// destaca prioridades distintas. Nada aqui altera autoridade de tenant — isso
// continua vindo da sessão no backend.
const verticals = {
  "studio-cut": {
    dayTitle: "Movimento de hoje",
    waitingSource: "WAITLIST",
    waitingLabel: "Encaixes aguardando contato",
    waitingHint: "Lista de espera do dia",
    showOccupancy: true,
    attentionOrder: ["waiting", "pendingUpcoming", "overdueFollowUps", "leadsWithoutNextAction", "leadsWithoutOwner", "followUpsToday"],
    leadShortcuts: [
      { id: "waitlist", label: "Encaixes", filters: { source: "WAITLIST" } },
      { id: "high", label: "Prioridade alta", filters: { priority: "HIGH" } },
      { id: "overdue", label: "Follow-up vencido", filters: { overdue: true } },
      { id: "no-action", label: "Sem próxima ação", filters: { noNextAction: true } },
      { id: "unassigned", label: "Sem responsável", filters: { unassigned: true } },
      { id: "today", label: "Novos hoje", filters: { newToday: true } }
    ]
  },
  lumiere: {
    dayTitle: "Atendimentos de hoje",
    waitingSource: "EVALUATION",
    waitingLabel: "Avaliações aguardando contato",
    waitingHint: "Pedidos de avaliação em aberto",
    showOccupancy: false,
    attentionOrder: ["waiting", "overdueFollowUps", "leadsWithoutNextAction", "pendingUpcoming", "leadsWithoutOwner", "followUpsToday"],
    leadShortcuts: [
      { id: "evaluation", label: "Avaliações", filters: { source: "EVALUATION" } },
      { id: "qualified", label: "Qualificados", filters: { status: "QUALIFIED" } },
      { id: "overdue", label: "Follow-up vencido", filters: { overdue: true } },
      { id: "no-action", label: "Sem próxima ação", filters: { noNextAction: true } },
      { id: "unassigned", label: "Sem responsável", filters: { unassigned: true } },
      { id: "high", label: "Prioridade alta", filters: { priority: "HIGH" } }
    ]
  }
};

const neutral = {
  dayTitle: "Agenda de hoje",
  waitingSource: null,
  waitingLabel: "Leads aguardando contato",
  waitingHint: "Pedidos em aberto",
  showOccupancy: true,
  attentionOrder: ["overdueFollowUps", "leadsWithoutNextAction", "pendingUpcoming", "leadsWithoutOwner", "followUpsToday"],
  leadShortcuts: [
    { id: "overdue", label: "Follow-up vencido", filters: { overdue: true } },
    { id: "no-action", label: "Sem próxima ação", filters: { noNextAction: true } },
    { id: "unassigned", label: "Sem responsável", filters: { unassigned: true } },
    { id: "high", label: "Prioridade alta", filters: { priority: "HIGH" } }
  ]
};

export function verticalConfig(tenantId) {
  return verticals[tenantId] || neutral;
}
