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

const HOUR = 3_600_000;

type Wall = { weekday: string; day: number; month: string; year: number; hour24: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts in a zone via Intl only (no host-local Date getters/setters). */
function wall(d: Date, timeZone: string): Wall {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return {
    weekday: p.weekday,
    day: Number(p.day),
    month: p.month,
    year: Number(p.year),
    hour24: Number(p.hour) % 24,
    minute: Number(p.minute),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const clock12 = (w: Wall) => `${w.hour24 % 12 || 12}:${pad(w.minute)} ${w.hour24 < 12 ? "AM" : "PM"}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthNum = (d: Date, tz: string) => MONTHS.indexOf(wall(d, tz).month) + 1;

/** Offset of the UK zone from UTC in ms at instant d, via Intl only (date-fns-tz's lookup uses host-local setters). */
function ukOffsetMs(d: Date): number {
  const w = wall(d, UK_TZ);
  const asUtc = Date.UTC(w.year, monthNum(d, UK_TZ) - 1, w.day, w.hour24, w.minute);
  const minuteFloor = Math.floor(d.getTime() / 60_000) * 60_000;
  return asUtc - minuteFloor;
}

export function ukZoneAt(d: Date): UkZone {
  return ukOffsetMs(d) === HOUR ? "BST" : "GMT";
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
  // Defensive: reject any date that rolled over.
  if (gmt.toISOString().slice(0, 16) !== `${date}T${time}`) {
    return { ok: false, reason: "invalid", message: MSG.invalid };
  }
  // Intl-based offsets: independent of the host time zone.
  const gmtOk = ukOffsetMs(gmt) === 0;
  const bstOk = ukOffsetMs(bst) === HOUR;
  if (!gmtOk && !bstOk) return { ok: false, reason: "nonexistent", message: MSG.nonexistent };
  if (gmtOk && bstOk) {
    if (!choice) return { ok: false, reason: "ambiguous", message: MSG.ambiguous };
    return choice === "BST" ? { ok: true, instant: bst, zone: "BST" } : { ok: true, instant: gmt, zone: "GMT" };
  }
  return gmtOk ? { ok: true, instant: gmt, zone: "GMT" } : { ok: true, instant: bst, zone: "BST" };
}

export function formatUk(d: Date): string {
  const w = wall(d, UK_TZ);
  return `${w.weekday} ${w.day} ${w.month} ${w.year}, ${clock12(w)}`;
}

export function formatUkWithZone(d: Date): string {
  return `${formatUk(d)} ${ukZoneAt(d)}`;
}

export function formatBd(d: Date): string {
  const w = wall(d, BD_TZ);
  return `${w.weekday} ${w.day} ${w.month}, ${clock12(w)}`;
}

export function toUkInputParts(d: Date): { date: string; time: string; zone: UkZone } {
  const w = wall(d, UK_TZ);
  return {
    date: `${w.year}-${pad(monthNum(d, UK_TZ))}-${pad(w.day)}`,
    time: `${pad(w.hour24)}:${pad(w.minute)}`,
    zone: ukZoneAt(d),
  };
}

function ukDayNumber(d: Date): number {
  const w = wall(d, UK_TZ);
  return Math.round(Date.UTC(w.year, monthNum(d, UK_TZ) - 1, w.day) / 86_400_000);
}

export function dueLabel(due: Date, now: Date): string {
  const diff = ukDayNumber(due) - ukDayNumber(now);
  const w = wall(due, UK_TZ);
  const clock = clock12(w);
  const day = `${w.weekday} ${w.day} ${w.month}`;
  if (due.getTime() >= now.getTime()) {
    if (diff === 0) return `Due today, ${clock}`;
    if (diff === 1) return `Due tomorrow, ${clock}`;
    return `Due ${day}, ${clock}`;
  }
  if (diff === 0) return `was due today, ${clock}`;
  if (diff === -1) return "was due yesterday";
  return `was due ${day}`;
}
