import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertTestTarget, LIVE_PROJECT_REF } from "../tests/env";

// Deletes leftover test data: only rows/users whose title/email starts with "t_".
// Default target: the TEST project (.env.test.local). Live needs `--live` AND ALLOW_LIVE_DB=1.

const live = process.argv.includes("--live");
if (live && process.env.ALLOW_LIVE_DB !== "1") {
  console.error("Sweeping the live database needs --live AND ALLOW_LIVE_DB=1.");
  process.exit(1);
}
const file = live ? ".env.local" : ".env.test.local";
if (!existsSync(file)) {
  console.error(`${file} not found.`);
  process.exit(1);
}
config({ path: file, quiet: true });
if (!live) assertTestTarget(process.env);
else if (!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(LIVE_PROJECT_REF)) {
  console.error("--live was given but .env.local does not point at the live project.");
  process.exit(1);
}

const admin: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function must<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
}

/** All object paths under a folder (recursive). */
async function listAll(bucket: string, folder: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
  for (const e of data ?? []) {
    const p = `${folder}/${e.name}`;
    if (e.id === null) out.push(...(await listAll(bucket, p)));
    else out.push(p);
  }
  return out;
}

async function main() {
  const assignments = must<{ id: string }[]>("assignments", await admin.from("assignments").select("id").like("title", "t\_%"));
  const lectures = must<{ id: string }[]>("lectures", await admin.from("lectures").select("id").like("title", "t\_%"));

  const targets: { bucket: string; ids: string[] }[] = [
    ...["questions", "solutions", "submissions"].map((bucket) => ({ bucket, ids: assignments.map((a) => a.id) })),
    { bucket: "lectures", ids: lectures.map((l) => l.id) },
  ];

  let objects = 0;
  let replaced = 0;
  for (const { bucket, ids } of targets) {
    for (const id of ids) {
      const names = await listAll(bucket, id);
      if (names.length) {
        must("remove", await admin.storage.from(bucket).remove(names));
        objects += names.length;
      }
      const del = await admin.from("replaced_files").delete({ count: "exact" }).eq("bucket", bucket).like("object_path", `${id}/%`);
      if (del.error) throw new Error(`replaced_files: ${del.error.message}`);
      replaced += del.count ?? 0;
    }
  }

  if (assignments.length) must("delete assignments", await admin.from("assignments").delete().in("id", assignments.map((a) => a.id)).select("id"));
  if (lectures.length) must("delete lectures", await admin.from("lectures").delete().in("id", lectures.map((l) => l.id)).select("id"));

  let users = 0;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const mine = data.users.filter((u) => (u.email ?? "").startsWith("t_"));
    for (const u of mine) {
      const r = await admin.auth.admin.deleteUser(u.id);
      if (r.error) throw new Error(`deleteUser: ${r.error.message}`);
      users++;
    }
    if (data.users.length < 200) break;
  }

  console.log(`Swept (${live ? "LIVE" : "test"} project):`);
  console.log(`  storage objects: ${objects}`);
  console.log(`  replaced_files rows: ${replaced}`);
  console.log(`  assignments: ${assignments.length}`);
  console.log(`  lectures: ${lectures.length}`);
  console.log(`  auth users: ${users}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
