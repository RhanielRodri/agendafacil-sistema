import { apiMode } from "../services/api.js";

// O backend original usa identificadores numéricos; o D1 usa TEXT. O formato do
// identificador é do transporte, não da tela, então a conversão mora aqui e as
// comparações nunca dependem do tipo.
export function toId(value) {
  if (value === "" || value === null || value === undefined) return null;
  return apiMode === "cloudflare" ? String(value) : Number(value);
}

export function sameId(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return String(left) === String(right);
}
