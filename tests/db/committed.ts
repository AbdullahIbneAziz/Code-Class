import { loadTestEnv } from "../env";
import { createClient } from "@supabase/supabase-js";
import type pg from "pg";
import { getPool } from "./helpers";

loadTestEnv();

/** Everything a committed (non-rolled-back) fixture created. Cleanup removes exactly this. */
export type Committed = {
  userIds: string[];
  assignmentIds: string[];
  objects: { bucket: string; name: string }[];
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Uploads a 1-byte object with the admin Storage API and records it for cleanup (call before relying on it). */
export async function uploadObject(track: Committed, bucket: string, name: string): Promise<void> {
  track.objects.push({ bucket, name });
  const { error } = await admin().storage.from(bucket).upload(name, new Blob(["x"]), { upsert: false });
  if (error) throw new Error(`upload ${bucket}/${name}: ${error.message}`);
}

/** Resolves once the backend `pid` is waiting on a lock; throws on timeout. Proves a second session really waited. */
export async function waitUntilBlocked(pid: number, timeoutMs = 5000): Promise<void> {
  const c = await getPool().connect();
  try {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const r = await c.query("select 1 from pg_stat_activity where pid = $1 and wait_event_type = 'Lock'", [pid]);
      if (r.rows.length) return;
      if (Date.now() > end) throw new Error(`backend ${pid} was not blocked on a lock within ${timeoutMs} ms`);
      await new Promise((r2) => setTimeout(r2, 50));
    }
  } finally {
    c.release();
  }
}

/** A raw pool client; the caller runs begin/actAs/... and must release it. */
export async function session(): Promise<pg.PoolClient> {
  return getPool().connect();
}

/**
 * Seeds committed fixtures (autocommit, as postgres), runs the test, and ALWAYS cleans up in finally:
 * storage objects (admin Storage API), replaced_files rows, assignments, then auth.users.
 */
export async function withCommitted<T>(
  seed: (c: pg.PoolClient, track: Committed) => Promise<void>,
  run: (track: Committed) => Promise<T>,
): Promise<T> {
  const track: Committed = { userIds: [], assignmentIds: [], objects: [] };
  let result: T | undefined;
  let runError: unknown;
  let ran = false;
  try {
    const c = await getPool().connect();
    try {
      await seed(c, track);
    } finally {
      c.release();
    }
    result = await run(track);
    ran = true;
  } catch (e) {
    runError = e;
  }
  const errors: Error[] = [];
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(new Error(`committed cleanup (${label}): ${(e as Error).message}`));
    }
  };
  const q = async (sql: string, params: unknown[]) => {
    const c = await getPool().connect();
    try {
      await c.query(sql, params);
    } finally {
      c.release();
    }
  };
  for (const b of [...new Set(track.objects.map((o) => o.bucket))]) {
    await step(`storage ${b}`, async () => {
      const names = track.objects.filter((o) => o.bucket === b).map((o) => o.name);
      const { error } = await admin().storage.from(b).remove(names);
      if (error) throw new Error(error.message);
    });
  }
  if (track.objects.length) {
    await step("replaced_files", () =>
      q("delete from public.replaced_files where object_path = any($1::text[])", [track.objects.map((o) => o.name)]),
    );
  }
  if (track.assignmentIds.length) {
    await step("assignments", () => q("delete from public.assignments where id = any($1::uuid[])", [track.assignmentIds]));
  }
  if (track.userIds.length) {
    await step("users", () => q("delete from auth.users where id = any($1::uuid[])", [track.userIds]));
  }
  if (!ran) throw runError;
  if (errors.length) throw errors[0];
  return result as T;
}
