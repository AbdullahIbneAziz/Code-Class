import { config } from "dotenv";
import { existsSync } from "node:fs";

/** The live project (the one the real site uses). Tests must never point at it. */
export const LIVE_PROJECT_REF = "xkwilscvfsneiovelfil";

const GUARD_MESSAGE = "Tests must run against the test database (.env.test.local), never the live project.";
const LIVE_MESSAGE = "Live-site e2e needs ALLOW_LIVE_DB=1 (it writes t_ test data to the live database).";

type Env = Record<string, string | undefined>;

/** Pure guard: throws unless the env points at a non-live Supabase project. */
export function assertTestTarget(env: Env): void {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const db = env.DATABASE_URL ?? "";
  if (!url || url.includes(LIVE_PROJECT_REF) || db.includes(LIVE_PROJECT_REF)) {
    throw new Error(GUARD_MESSAGE);
  }
}

/** Pure: which env file to load. A BASE_URL (live-site) run needs ALLOW_LIVE_DB=1. */
export function resolveEnvFile(env: Env): { file: string; live: boolean } {
  // Vitest itself sets BASE_URL="/" (a Vite built-in), so only a real http(s) address counts.
  if (env.BASE_URL && /^https?:\/\//i.test(env.BASE_URL)) {
    if (env.ALLOW_LIVE_DB !== "1") throw new Error(LIVE_MESSAGE);
    return { file: ".env.local", live: true };
  }
  return { file: ".env.test.local", live: false };
}

/** Loads the test env (or, on purpose, the live one) and runs the guard. Returns the values. */
export function loadTestEnv(): Env {
  const { file, live } = resolveEnvFile(process.env);
  if (!live && !existsSync(file)) throw new Error(GUARD_MESSAGE);
  config({ path: file, quiet: true });
  if (!live) assertTestTarget(process.env);
  return process.env;
}
