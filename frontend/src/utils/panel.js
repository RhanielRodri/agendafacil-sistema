import { formatBrazilPhone } from "./phone.js";

export const appointmentStatuses = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
export const leadStatuses = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
export const activeLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED"];

export const appointmentStatusLabels = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu"
};

export const leadStatusLabels = {
  NEW: "Novo",
  CONTACTED: "Contatado",
  QUALIFIED: "Qualificado",
  CONVERTED: "Convertido",
  LOST: "Perdido"
};

export const leadSourceLabels = {
  BOOKING: "Agendamento",
  WAITLIST: "Lista de espera",
  EVALUATION: "Avaliação",
  CONTACT: "Contato",
  ABANDONED_BOOKING: "Agendamento abandonado",
  MANUAL: "Manual"
};

export const leadPriorityLabels = { LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta" };

export const followUpTypeLabels = {
  CONTACT: "Contato",
  RETURN: "Retorno",
  EVALUATION: "Avaliação",
  WAITLIST: "Lista de espera",
  OTHER: "Outro"
};

export const followUpStatusLabels = {
  OPEN: "Aberto",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado"
};

export const lostReasonLabels = {
  NO_RESPONSE: "Sem resposta",
  PRICE: "Preço",
  NO_AVAILABILITY: "Sem disponibilidade",
  CHANGED_MIND: "Mudou de ideia",
  NOT_A_FIT: "Não adequado",
  DUPLICATE: "Duplicado",
  OTHER: "Outro"
};

export const appointmentTransitions = {
  PENDING: [
    { status: "CONFIRMED", label: "Confirmar", primary: true },
    { status: "CANCELLED", label: "Cancelar" }
  ],
  CONFIRMED: [
    { status: "COMPLETED", label: "Concluir", primary: true },
    { status: "NO_SHOW", label: "Não compareceu" },
    { status: "CANCELLED", label: "Cancelar" }
  ],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

const weekDayShort = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function shiftIsoDay(iso, days) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDayLabel(iso) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${weekDayShort[date.getUTCDay()]}, ${day}/${month}`;
}

export function relativeDayLabel(iso) {
  const today = todayIso();
  if (iso === today) return "Hoje";
  if (iso === shiftIsoDay(today, 1)) return "Amanhã";
  if (iso === shiftIsoDay(today, -1)) return "Ontem";
  return formatDayLabel(iso);
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function delayLabel(dueAt, now = new Date()) {
  const diff = now.getTime() - new Date(dueAt).getTime();
  if (diff <= 0) return null;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} min em atraso`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h em atraso`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "dia" : "dias"} em atraso`;
}

export function maskPhone(phone = "") {
  return formatBrazilPhone(phone);
}

export function formatMinutes(total) {
  if (!total) return "0 min";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

export function pageItems(data) {
  return Array.isArray(data) ? data : data?.items || [];
}

export function pageInfo(data, fallbackLimit = 20) {
  return data?.pagination || { page: 1, limit: fallbackLimit, total: pageItems(data).length, pages: 1 };
}
