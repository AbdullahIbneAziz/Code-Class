import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import type { FileRow } from "@/lib/files/types";
import { mapStudentItem, type ItemRow } from "./map";
import type { HomeworkStatus, StudentItem, TeacherHomework, TeacherHomeworkDetail } from "./types";

export { mapStudentItem };

type ListRow = {
  id: string;
  title: string;
  visible_from: string;
  due_at: string;
  assignment_students: { count: number }[];
  submissions: { count: number }[];
};

export async function listHomeworkForTeacher(client: SupabaseClient): Promise<TeacherHomework[]> {
  const { data, error } = await client
    .from("assignments")
    .select("id, title, visible_from, due_at, assignment_students(count), submissions(count)")
    .eq("kind", "homework")
    .order("due_at", { ascending: false });
  if (error) throw new Error(`Could not load homework: ${error.message}`);
  await connection(); // request time: the clock below must not be prerendered
  const now = Date.now();
  return ((data ?? []) as unknown as ListRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    visibleFrom: r.visible_from,
    dueAt: r.due_at,
    isScheduled: new Date(r.visible_from).getTime() > now,
    studentCount: r.assignment_students[0]?.count ?? 0,
    submittedCount: r.submissions[0]?.count ?? 0,
  }));
}

type DetailRow = {
  id: string;
  title: string;
  instructions: string | null;
  max_marks: number | string;
  visible_from: string;
  due_at: string;
  solution_unlocked_for_all: boolean;
  assignment_files: {
    id: string;
    purpose: string;
    original_name: string;
    object_path: string;
    size_bytes: number;
    created_at: string;
  }[];
};

/** The earliest solution file by created_at, then id, so the pick is deterministic. */
function solutionRow(files: DetailRow["assignment_files"]): FileRow | null {
  const sorted = [...files].sort(
    (x, y) => x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id),
  );
  const f = sorted.find((x) => x.purpose === "solution");
  return f ? toFileRow(f) : null;
}

function toFileRow(f: DetailRow["assignment_files"][number]): FileRow {
  return {
    id: f.id,
    originalName: f.original_name,
    objectPath: f.object_path,
    sizeBytes: Number(f.size_bytes),
    createdAt: f.created_at,
  };
}

export async function getHomeworkForTeacher(client: SupabaseClient, id: string): Promise<TeacherHomeworkDetail | null> {
  const { data, error } = await client
    .from("assignments")
    .select(
      "id, title, instructions, max_marks, visible_from, due_at, solution_unlocked_for_all, assignment_files(id, purpose, original_name, object_path, size_bytes, created_at)",
    )
    .eq("id", id)
    .eq("kind", "homework")
    .order("created_at", { referencedTable: "assignment_files", ascending: true })
    .maybeSingle();
  if (error) throw new Error(`Could not load homework: ${error.message}`);
  if (!data) return null;
  const a = data as unknown as DetailRow;
  const { data: items, error: iErr } = await client
    .from("student_items")
    .select("*")
    .eq("assignment_id", id)
    .order("student_name");
  if (iErr) throw new Error(`Could not load students: ${iErr.message}`);
  await connection();
  const students = ((items ?? []) as unknown as ItemRow[]).map(mapStudentItem);
  return {
    id: a.id,
    title: a.title,
    instructions: a.instructions,
    maxMarks: Number(a.max_marks),
    visibleFrom: a.visible_from,
    dueAt: a.due_at,
    isVisible: new Date(a.visible_from).getTime() <= Date.now(),
    anySubmission: students.some((s) => s.hasSubmission),
    files: a.assignment_files.filter((f) => f.purpose === "question").map(toFileRow),
    solution: solutionRow(a.assignment_files),
    solutionUnlockedForAll: a.solution_unlocked_for_all === true,
    students,
  };
}

export async function listActiveStudents(
  client: SupabaseClient,
): Promise<{ id: string; displayName: string; username: string }[]> {
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, username")
    .eq("role", "student")
    .eq("is_active", true)
    .order("username");
  if (error) throw new Error(`Could not load students: ${error.message}`);
  return (data ?? []).map((p) => ({ id: p.id, displayName: p.display_name, username: p.username ?? "" }));
}

/** The signed-in student's own homework rows (the view hides everything not yet visible or not theirs). */
export async function listMyItems(client: SupabaseClient): Promise<StudentItem[]> {
  const { data, error } = await client
    .from("student_items")
    .select("*")
    .eq("kind", "homework")
    .order("effective_due_at", { ascending: true });
  if (error) throw new Error(`Could not load homework: ${error.message}`);
  return ((data ?? []) as unknown as ItemRow[]).map(mapStudentItem);
}

export async function getMyItem(client: SupabaseClient, assignmentId: string): Promise<StudentItem | null> {
  const { data, error } = await client
    .from("student_items")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("kind", "homework")
    .maybeSingle();
  if (error) throw new Error(`Could not load homework: ${error.message}`);
  return data ? mapStudentItem(data as unknown as ItemRow) : null;
}

/** Question files; RLS on assignment_files decides what the student may see. */
export async function listQuestionFiles(client: SupabaseClient, assignmentId: string): Promise<FileRow[]> {
  const { data, error } = await client
    .from("assignment_files")
    .select("id, original_name, object_path, size_bytes, created_at")
    .eq("assignment_id", assignmentId)
    .eq("purpose", "question")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load files: ${error.message}`);
  return (data ?? []).map((f) => ({
    id: f.id,
    originalName: f.original_name,
    objectPath: f.object_path,
    sizeBytes: Number(f.size_bytes),
    createdAt: f.created_at,
  }));
}

/** The student's visible solution file per assignment; RLS decides what comes back (earliest row wins). */
export async function listMySolutions(client: SupabaseClient, assignmentIds: string[]): Promise<Map<string, FileRow>> {
  const out = new Map<string, FileRow>();
  if (assignmentIds.length === 0) return out;
  const { data, error } = await client
    .from("assignment_files")
    .select("id, assignment_id, original_name, object_path, size_bytes, created_at")
    .eq("purpose", "solution")
    .in("assignment_id", assignmentIds)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`Could not load solutions: ${error.message}`);
  for (const f of data ?? []) {
    if (out.has(f.assignment_id)) continue;
    out.set(f.assignment_id, toFileRow({ ...f, purpose: "solution" }));
  }
  return out;
}

type StatusRow = {
  id: string;
  title: string;
  due_at: string;
  solution_unlocked_for_all: boolean;
  assignment_files: { purpose: string }[];
};

/** The most recently due homeworks (deadline already passed at `now`), each with every student's row. */
export async function listHomeworkStatus(client: SupabaseClient, limit: number, now: Date): Promise<HomeworkStatus[]> {
  const { data, error } = await client
    .from("assignments")
    .select("id, title, due_at, solution_unlocked_for_all, assignment_files(purpose)")
    .eq("kind", "homework")
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load homework: ${error.message}`);
  const rows = (data ?? []) as unknown as StatusRow[];
  if (rows.length === 0) return [];
  const { data: items, error: iErr } = await client
    .from("student_items")
    .select("*")
    .in("assignment_id", rows.map((r) => r.id))
    .order("student_name");
  if (iErr) throw new Error(`Could not load students: ${iErr.message}`);
  const mapped = ((items ?? []) as unknown as ItemRow[]).map(mapStudentItem);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueAt: r.due_at,
    solutionUploaded: r.assignment_files.some((f) => f.purpose === "solution"),
    solutionUnlockedForAll: r.solution_unlocked_for_all === true,
    students: mapped.filter((s) => s.assignmentId === r.id),
  }));
}
