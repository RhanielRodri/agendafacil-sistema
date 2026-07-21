// Preço ausente não é zero: quem não informou preço não vira "R$ 0,00".
export function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value));
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC"
  }).format(new Date(value));
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}
