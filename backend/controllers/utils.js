export const allowedStatuses = ["NEW", "CONFIRMED", "COMPLETED", "CANCELLED"];

export function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizeDate(date) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function isValidDateInput(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = normalizeDate(date);
  return !Number.isNaN(d.getTime());
}

export function isDateInPast(date) {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return normalizeDate(date) < todayUtc;
}

export function isValidTimeFormat(time) {
  if (typeof time !== "string") return false;
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [h, m] = time.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function sanitizeId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}
