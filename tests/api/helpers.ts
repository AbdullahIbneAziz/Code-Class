import { config } from "dotenv";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { usernameToEmail } from "@/lib/auth/username";

config({ path: ".env.local", quiet: true });

const URL_ = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

// Test-only admin client (src/lib/supabase/admin.ts is server-only and cannot load under vitest).
export function adminClient(): SupabaseClient {
  return createClient(URL_(), process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
}
export function anonClient(): SupabaseClient {
  return createClient(URL_(), ANON(), opts);
}

const createdUserIds: string[] = [];
const createdAssignmentIds: string[] = [];
const uploaded: { bucket: string; path: string }[] = [];

/** Record an object path so cleanupTestUsers removes it (call BEFORE uploading). */
export function trackObject(bucket: string, path: string): void {
  uploaded.push({ bucket, path });
}

const trackedFolders: { bucket: string; folder: string }[] = [];
const createdLectureIds: string[] = [];
const lectureTitles: string[] = [];
const assignmentTitles: string[] = [];

/** Register an assignment TITLE before the UI creates it; cleanup resolves ids by title and removes rows + question objects. */
export function trackAssignmentTitle(title: string): void {
  assignmentTitles.push(title);
}

/** Register a lecture TITLE before the UI creates it; cleanup resolves ids by title and removes rows + objects. */
export function trackLectureTitle(title: string): void {
  lectureTitles.push(title);
}

/** Record a storage folder; cleanup lists it recursively and removes every object (and replaced_files rows). */
export function trackFolder(bucket: string, folder: string): void {
  trackedFolders.push({ bucket, folder });
}

/** Record a lecture id so cleanup deletes the row (lecture_files cascade). */
export function trackLecture(id: string): void {
  createdLectureIds.push(id);
}

async function listAllPaths(bucket: string, folder: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [folder];
  while (stack.length) {
    const dir = stack.pop()!;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await adminClient().storage.from(bucket).list(dir, { limit: 100, offset });
      if (error) throw new Error(`list ${bucket}/${dir}: ${error.message}`);
      for (const e of data ?? []) {
        if (e.id === null) stack.push(`${dir}/${e.name}`);
        else out.push(`${dir}/${e.name}`);
      }
      if ((data?.length ?? 0) < 100) break;
    }
  }
  return out;
}

export type TestUser = { id: string; username: string; password: string; client: SupabaseClient };

export async function makeTestUser(
  role: "teacher" | "student",
  o: { isActive?: boolean; mustChangePassword?: boolean } = {},
): Promise<TestUser> {
  const admin = adminClient();
  const username = `t_${role}_${randomBytes(3).toString("hex")}`;
  const password = `Pw-${randomBytes(9).toString("hex")}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const id = data.user.id;
  createdUserIds.push(id);
  const { error: pErr } = await admin.from("profiles").insert({
    id,
    role,
    username,
    display_name: `Test ${role}`,
    is_active: o.isActive ?? true,
    must_change_password: o.mustChangePassword ?? false,
  });
  if (pErr) throw new Error(`profile insert failed: ${pErr.message}`);
  const client = anonClient();
  const { error: sErr } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (sErr) throw new Error(`sign-in failed: ${sErr.message}`);
  return { id, username, password, client };
}

const HOUR = 3_600_000;
export async function adminSeedAssignment(
  partial: Partial<{
    kind: "homework" | "test";
    title: string;
    visible_from: string;
    opens_at: string;
    due_at: string;
    max_marks: number;
  }> = {},
): Promise<string> {
  const now = Date.now();
  const row = {
    kind: "homework",
    title: "t_storage_test",
    max_marks: 10,
    visible_from: new Date(now - 3 * HOUR).toISOString(),
    opens_at: new Date(now - 2 * HOUR).toISOString(),
    due_at: new Date(now + 24 * HOUR).toISOString(),
    ...partial,
  };
  const { data, error } = await adminClient().from("assignments").insert(row).select("id").single();
  if (error) throw new Error(`seed assignment failed: ${error.message}`);
  createdAssignmentIds.push(data.id);
  return data.id as string;
}

export async function adminAssign(assignmentId: string, studentId: string): Promise<void> {
  const { error } = await adminClient()
    .from("assignment_students")
    .insert({ assignment_id: assignmentId, student_id: studentId });
  if (error) throw new Error(`assign failed: ${error.message}`);
}

export function fileOfSize(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
}

export const uuid = () => randomUUID();

/** Deletes every storage object, assignment and Auth user created in this run. */
export async function cleanupTestUsers(): Promise<void> {
  const admin = adminClient();
  const errors: string[] = [];
  const byBucket = new Map<string, string[]>();
  for (const o of uploaded) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.path]);
  for (const [bucket, paths] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) errors.push(`remove ${bucket}: ${error.message}`);
    const { error: rErr } = await admin.from("replaced_files").delete().eq("bucket", bucket).in("object_path", paths);
    if (rErr) errors.push(`replaced_files ${bucket}: ${rErr.message}`);
  }
  uploaded.length = 0;
  for (const title of lectureTitles.splice(0)) {
    const { data, error } = await admin.from("lectures").select("id").eq("title", title);
    if (error) errors.push(`lecture lookup: ${error.message}`);
    for (const l of data ?? []) {
      createdLectureIds.push(l.id);
      trackedFolders.push({ bucket: "lectures", folder: l.id });
    }
  }
  for (const title of assignmentTitles.splice(0)) {
    const { data, error } = await admin.from("assignments").select("id").eq("title", title);
    if (error) errors.push(`assignment lookup: ${error.message}`);
    for (const a of data ?? []) {
      createdAssignmentIds.push(a.id);
      for (const bucket of ["questions", "solutions", "submissions"]) trackedFolders.push({ bucket, folder: a.id });
    }
  }
  for (const { bucket, folder } of trackedFolders.splice(0)) {
    try {
      const paths = await listAllPaths(bucket, folder);
      if (paths.length) {
        const { error } = await admin.storage.from(bucket).remove(paths);
        if (error) errors.push(`remove ${bucket}/${folder}: ${error.message}`);
        const { error: rErr } = await admin.from("replaced_files").delete().eq("bucket", bucket).in("object_path", paths);
        if (rErr) errors.push(`replaced_files: ${rErr.message}`);
      }
    } catch (e) {
      errors.push(String(e));
    }
  }
  if (createdLectureIds.length) {
    const { error } = await admin.from("lectures").delete().in("id", createdLectureIds);
    if (error) errors.push(`lectures: ${error.message}`);
    createdLectureIds.length = 0;
  }
  if (createdAssignmentIds.length) {
    const { error } = await admin.from("assignments").delete().in("id", createdAssignmentIds);
    if (error) errors.push(`assignments: ${error.message}`);
    createdAssignmentIds.length = 0;
  }
  for (const id of createdUserIds.splice(0)) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) errors.push(`deleteUser ${id}: ${error.message}`);
  }
  if (errors.length) throw new Error(`cleanup problems: ${errors.join("; ")}`);
}
