const brazilDdds = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99"
]);

export function parseBrazilPhone(value) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (![10, 11].includes(national.length) || !brazilDdds.has(national.slice(0, 2))) return null;
  const subscriber = national.slice(2);
  if (national.length === 11 ? !subscriber.startsWith("9") : !/^[2-5]/.test(subscriber)) return null;
  const split = national.length === 11 ? 7 : 6;
  return {
    normalized: `55${national}`,
    national,
    formatted: `(${national.slice(0, 2)}) ${national.slice(2, split)}-${national.slice(split)}`
  };
}

export function phoneLookupValues(normalized) {
  return [normalized, normalized.slice(2)];
}

export function phoneSearchValues(value) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (!digits) return [];
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return [...new Set([digits, national])];
}
