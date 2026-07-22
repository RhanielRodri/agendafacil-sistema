import { HttpError } from "./http";

export interface TimeWindow {
  startTime: string;
  endTime: string;
}

export interface AvailabilityBlock extends Partial<TimeWindow> {
  allDay: boolean;
}

export interface AvailabilityInput {
  business: (TimeWindow & { isOpen: boolean }) | null;
  professional: TimeWindow[];
  blocks: AvailabilityBlock[];
  occupied: TimeWindow[];
  durationMinutes: number;
  slotMinutes: number;
}

export function timeToMinutes(value: string): number {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new HttpError(400, "INVALID_REQUEST", "Horário inválido");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function contains(window: TimeWindow, start: number, end: number): boolean {
  return start >= timeToMinutes(window.startTime) && end <= timeToMinutes(window.endTime);
}

function overlaps(window: TimeWindow, start: number, end: number): boolean {
  return timeToMinutes(window.startTime) < end && timeToMinutes(window.endTime) > start;
}

export function calculateSlots(input: AvailabilityInput): string[] {
  if (!input.business?.isOpen) return [];
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new HttpError(400, "INVALID_REQUEST", "Duração inválida");
  }
  if (!Number.isInteger(input.slotMinutes) || input.slotMinutes <= 0) {
    throw new HttpError(400, "INVALID_REQUEST", "Grade inválida");
  }
  if (input.blocks.some((block) => block.allDay)) return [];

  const businessStart = timeToMinutes(input.business.startTime);
  const businessEnd = timeToMinutes(input.business.endTime);
  const partialBlocks = input.blocks.filter(
    (block): block is AvailabilityBlock & TimeWindow => !block.allDay && Boolean(block.startTime && block.endTime)
  );
  const slots: string[] = [];

  for (let start = businessStart; start + input.durationMinutes <= businessEnd; start += input.slotMinutes) {
    const end = start + input.durationMinutes;
    if (!input.professional.some((window) => contains(window, start, end))) continue;
    if (partialBlocks.some((block) => overlaps(block, start, end))) continue;
    if (input.occupied.some((window) => overlaps(window, start, end))) continue;
    slots.push(minutesToTime(start));
  }

  return slots;
}
