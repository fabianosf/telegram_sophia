export const BRASILIA_TZ = "America/Sao_Paulo";

const clockFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRASILIA_TZ,
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const displayFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRASILIA_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function partsMap(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BRASILIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function formatBrasilia(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${displayFmt.format(date)} BRT`;
}

export function nowBrasiliaLabel(): string {
  return `${clockFmt.format(new Date())} (Brasília)`;
}

export function toBrasiliaDateTimeLocal(date: Date, plusMs = 0): string {
  const { year, month, day, hour, minute, second } = partsMap(
    new Date(date.getTime() + plusMs)
  );
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

/** Interpreta datetime-local como horário de Brasília (UTC−3, sem horário de verão). */
export function brasiliaLocalToISO(local: string): string {
  const normalized = local.length === 16 ? `${local}:00` : local;
  return new Date(`${normalized}-03:00`).toISOString();
}
