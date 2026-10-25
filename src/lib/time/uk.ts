import { formatInTimeZone } from "date-fns-tz";

export const UK_TZ = "Europe/London";
export const BD_TZ = "Asia/Dhaka";
export type UkZone = "GMT" | "BST";

export type ParseResult =
  | { ok: true; instant: Date; zone: UkZone }
  | { ok: false; reason: "nonexistent" | "ambiguous" | "invalid"; message: string };

const MSG = {
  nonexistent: "This time doesn't exist in the UK on this day (clocks go forward). Please choose another time.",
  ambiguous: "This time happens twice in the UK on this day (clocks go back). BST (first time) or GMT (second time)?",
  invalid: "Please enter a valid date and time.",
} as const;

const LOCAL_FMT = "yyyy-MM-dd'T'HH:mm";

export function ukZoneAt(d: Date): UkZone {
  return formatInTimeZone(d, UK_TZ, "xxx") === "+01:00" ? "BST" : "GMT";
}

/** Parse a UK wall-clock date (yyyy-MM-dd) and time (HH:mm) into an instant. Independent of the process time zone. */
export function parseUkLocal(date: string, time: string, choice?: UkZone): ParseResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, reason: "invalid", message: MSG.invalid };
  }
  const gmt = new Date(`${date}T${time}:00Z`);
  const bst = new Date(`${date}T${time}:00+01:00`);
  if (Number.isNaN(gmt.getTime()) || Number.isNaN(bst.getTime())) {
    return { ok: false, reason: "invalid", message: MSG.invalid };
  }
  const want = `${date}T${time}`;
  // Defensive: reject any date that rolled over.
  if (gmt.toISOString().slice(0, 16) !== want) {
    return { ok: false, reason: "invalid", message: MSG.invalid };
  }
  const gmtOk = formatInTimeZone(gmt, UK_TZ, LOCAL_FMT) === want;
  const bstOk = formatInTimeZone(bst, UK_TZ, LOCAL_FMT) === want;
  if (!gmtOk && !bstOk) return { ok: false, reason: "nonexistent", message: MSG.nonexistent };
  if (gmtOk && bstOk) {
    if (!choice) return { ok: false, reason: "ambiguous", message: MSG.ambiguous };
    return choice === "BST" ? { ok: true, instant: bst, zone: "BST" } : { ok: true, instant: gmt, zone: "GMT" };
  }
  return gmtOk ? { ok: true, instant: gmt, zone: "GMT" } : { ok: true, instant: bst, zone: "BST" };
}

export function formatUk(d: Date): string {
  return formatInTimeZone(d, UK_TZ, "EEE d MMM yyyy, h:mm a");
}

export function formatUkWithZone(d: Date): string {
  return `${formatUk(d)} ${ukZoneAt(d)}`;
}

export function formatBd(d: Date): string {
  return formatInTimeZone(d, BD_TZ, "EEE d MMM, h:mm a");
}

export function toUkInputParts(d: Date): { date: string; time: string; zone: UkZone } {
  return {
    date: formatInTimeZone(d, UK_TZ, "yyyy-MM-dd"),
    time: formatInTimeZone(d, UK_TZ, "HH:mm"),
    zone: ukZoneAt(d),
  };
}

function ukDayNumber(d: Date): number {
  const [y, m, day] = formatInTimeZone(d, UK_TZ, "yyyy-MM-dd").split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
}

export function dueLabel(due: Date, now: Date): string {
  const diff = ukDayNumber(due) - ukDayNumber(now);
  const clock = formatInTimeZone(due, UK_TZ, "h:mm a");
  const day = formatInTimeZone(due, UK_TZ, "EEE d MMM");
  if (due.getTime() >= now.getTime()) {
    if (diff === 0) return `Due today, ${clock}`;
    if (diff === 1) return `Due tomorrow, ${clock}`;
    return `Due ${day}, ${clock}`;
  }
  if (diff === 0) return `was due today, ${clock}`;
  if (diff === -1) return "was due yesterday";
  return `was due ${day}`;
}
