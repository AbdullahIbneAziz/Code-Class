import { config } from "dotenv";
import pg from "pg";
import { randomUUID } from "node:crypto";

config({ path: ".env.local", quiet: true });

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (.env.local)");
    pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Runs fn inside a transaction that is ALWAYS rolled back (shared live dev DB). */
export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    try {
      await c.query("rollback");
    } finally {
      c.release();
    }
  }
}

/** Switch the current transaction to act as a given user (or anon when null). */
export async function actAs(c: pg.PoolClient, userId: string | null): Promise<void> {
  if (userId === null) {
    await c.query("set local role anon");
    await c.query(
      "select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true)",
    );
    return;
  }
  await c.query("set local role authenticated");
  await c.query(
    "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
    [userId],
  );
}

export async function seedUser(
  c: pg.PoolClient,
  opts: { role: "teacher" | "student"; username: string; isActive?: boolean; exact?: boolean },
): Promise<string> {
  const id = randomUUID();
  // Unique suffix so parallel uncommitted transactions never block on the same username/email key.
  const username = opts.exact ? opts.username : `${opts.username}_${id.slice(0, 8)}`;
  await c.query(
    `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
    [id, `${username}@test.invalid`],
  );
  await c.query(
    `insert into public.profiles (id, role, username, display_name, is_active)
     values ($1, $2, $3, $4, $5)`,
    [id, opts.role, username, `Test ${username}`, opts.isActive ?? true],
  );
  return id;
}

export type AssignmentSeed = {
  kind?: "homework" | "test";
  title?: string;
  max_marks?: number;
  visible_from?: string;
  opens_at?: string;
  due_at?: string;
};

export async function seedAssignment(c: pg.PoolClient, p: AssignmentSeed = {}): Promise<string> {
  const r = await c.query(
    `insert into public.assignments (kind, title, max_marks, visible_from, opens_at, due_at)
     values ($1, $2, $3,
       coalesce($4::timestamptz, now() - interval '2 days'),
       coalesce($5::timestamptz, now() - interval '1 day'),
       coalesce($6::timestamptz, now() + interval '7 days'))
     returning id`,
    [p.kind ?? "homework", p.title ?? "t_assignment", p.max_marks ?? 10, p.visible_from ?? null, p.opens_at ?? null, p.due_at ?? null],
  );
  return r.rows[0].id as string;
}

export async function assign(
  c: pg.PoolClient,
  assignmentId: string,
  studentId: string,
  o: { opens_at_override?: string | null; due_at_override?: string | null; excused?: boolean } = {},
): Promise<void> {
  await c.query(
    `insert into public.assignment_students (assignment_id, student_id, opens_at_override, due_at_override, excused)
     values ($1, $2, $3, $4, $5)`,
    [assignmentId, studentId, o.opens_at_override ?? null, o.due_at_override ?? null, o.excused ?? false],
  );
}

/** Inserts a storage.objects row (as postgres, inside the tx) so attach_file/replace_file can find it. */
export async function seedObject(
  c: pg.PoolClient,
  bucket: string,
  name: string,
  sizeBytes: number,
  ownerId?: string,
): Promise<void> {
  await c.query(
    `insert into storage.objects (bucket_id, name, owner_id, metadata)
     values ($1, $2, $3, jsonb_build_object('size', $4::bigint))`,
    [bucket, name, ownerId ?? null, sizeBytes],
  );
}
