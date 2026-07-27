const BRAZIL_DDDS = new Set([
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

export function brazilPhoneDigits(value = "") {
  const digits = String(value).replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return national.slice(0, 11);
}

export function maskBrazilPhone(value = "") {
  const digits = brazilPhoneDigits(value);
  if (!digits) return "";
  if (digits.length < 3) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  const split = digits.length === 11 ? 5 : 4;
  if (subscriber.length <= split) return `(${ddd}) ${subscriber}`;
  return `(${ddd}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`;
}

export function normalizeBrazilPhone(value = "") {
  const national = brazilPhoneDigits(value);
  if (![10, 11].includes(national.length) || !BRAZIL_DDDS.has(national.slice(0, 2))) return null;
  const subscriber = national.slice(2);
  if (national.length === 11 ? !subscriber.startsWith("9") : !/^[2-5]/.test(subscriber)) return null;
  return `55${national}`;
}

export function formatBrazilPhone(value = "") {
  return normalizeBrazilPhone(value) ? maskBrazilPhone(value) : String(value);
}
