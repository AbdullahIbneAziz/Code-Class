import { parseUkLocal, type UkZone } from "./uk";

export type UkFieldResult =
  | { ok: true; instant: Date | null }
  | { ok: false; message: string; needsZoneChoice?: true };

function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function readUkField(
  fd: FormData,
  name: "visibleFrom" | "due",
  opts: { optional: boolean },
): UkFieldResult {
  const date = text(fd, `${name}Date`);
  const time = text(fd, `${name}Time`);
  if (!date && !time && opts.optional) return { ok: true, instant: null };
  const z = text(fd, `${name}Zone`);
  const choice: UkZone | undefined = z === "BST" || z === "GMT" ? z : undefined;
  const r = parseUkLocal(date, time, choice);
  if (r.ok) return { ok: true, instant: r.instant };
  return r.reason === "ambiguous"
    ? { ok: false, message: r.message, needsZoneChoice: true }
    : { ok: false, message: r.message };
}
