export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseDay(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function dateLong(iso: string): string {
  const date = parseDay(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function dateShort(iso: string): string {
  const date = parseDay(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
}

export function dateCompact(iso: string): string {
  const date = parseDay(iso);
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]
    .slice(0, 3)
    .toUpperCase()}`;
}

export function weekday(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(parseDay(iso));
}

export function isoToday(iso: string): Date {
  return parseDay(iso);
}

export function shiftIsoDay(iso: string, delta: number): string {
  const date = parseDay(iso);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Extract HH:MM from an Elexon UTC timestamp without local-time drift. */
export function timeOfIso(timestamp: string): string {
  return timestamp.slice(11, 16);
}

export function timestampLabel(timestamp: string): string {
  const day = timestamp.slice(0, 10);
  return `${dateShort(day)} · ${timeOfIso(timestamp)}Z`;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function mw(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${formatNumber(value, digits)} MW`;
}

export function gw(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1000) {
    return `${formatNumber(value / 1000, digits)} GW`;
  }
  return `${formatNumber(value, 0)} MW`;
}

export function signedGw(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${gw(Math.abs(value), digits)}`;
}

export function signedPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), digits)}%`;
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${formatNumber(value, digits)}%`;
}

export function gwh(mwhValue: number | null | undefined, digits = 1): string {
  if (mwhValue === null || mwhValue === undefined || Number.isNaN(mwhValue)) return "—";
  return `${formatNumber(mwhValue / 1000, digits)} GWh`;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function fileDate(iso: string): string {
  return iso.replaceAll("-", "");
}
