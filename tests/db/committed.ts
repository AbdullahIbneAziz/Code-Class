import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type pg from "pg";
import { getPool } from "./helpers";

config({ path: ".env.local", quiet: true });

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
  try {
    const c = await getPool().connect();
    try {
      await seed(c, track);
    } finally {
      c.release();
    }
    return await run(track);
  } finally {
    const errors: string[] = [];
    const c = await getPool().connect();
    try {
      for (const b of [...new Set(track.objects.map((o) => o.bucket))]) {
        const names = track.objects.filter((o) => o.bucket === b).map((o) => o.name);
        const { error } = await admin().storage.from(b).remove(names);
        if (error) errors.push(`remove ${b}: ${error.message}`);
      }
      if (track.objects.length) {
        await c.query("delete from public.replaced_files where object_path = any($1::text[])", [
          track.objects.map((o) => o.name),
        ]);
      }
      if (track.assignmentIds.length) {
        await c.query("delete from public.assignments where id = any($1::uuid[])", [track.assignmentIds]);
      }
      if (track.userIds.length) {
        await c.query("delete from auth.users where id = any($1::uuid[])", [track.userIds]);
      }
    } catch (e) {
      errors.push((e as Error).message);
    } finally {
      c.release();
    }
    if (errors.length) console.error("committed cleanup problems:", errors.join("; "));
  }
}
