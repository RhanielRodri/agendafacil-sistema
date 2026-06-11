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
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(normalizeDate(date).getTime());
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
