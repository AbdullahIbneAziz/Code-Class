/** At most 2 decimals, trailing zeros dropped. */
export function formatMark(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function markText(mark: number, max: number): string {
  return `${formatMark(mark)}/${formatMark(max)}`;
}

/** Only checks that it is a number; the allowed range belongs to the database. */
export function parseMarkInput(raw: string): { ok: true; mark: number } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === "") return { ok: false, message: "Please enter a mark." };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, message: "Please enter a mark as a number." };
  return { ok: true, mark: n };
}

/** The database refusal when the student uploaded again after the teacher loaded the page. */
export const REVISION_MESSAGE = "This student uploaded a new version. Please download it again.";
