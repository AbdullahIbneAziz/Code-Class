export type ActionResult = { ok: true } | { ok: false; message: string };

const GENERIC = "Something went wrong. Please try again.";

/** Maps a Postgres/PostgREST error to user-facing copy (P0001 = rule refusal, 42501 = no permission). */
export function rpcErrorMessage(error: { code?: string; message: string } | null): string {
  if (!error) return GENERIC;
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "You don't have permission to do that.";
  return GENERIC;
}
