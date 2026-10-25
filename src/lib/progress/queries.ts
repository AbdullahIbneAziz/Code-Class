import type { SupabaseClient } from "@supabase/supabase-js";
import { mapStudentItem, type ItemRow } from "@/lib/homework/map";
import type { StudentItem } from "@/lib/homework/types";
import { toProgress } from "./format";
import type { GlanceRow, Progress, ProgressRow } from "./types";

export async function getMyProgress(client: SupabaseClient, studentId: string): Promise<Progress> {
  const { data, error } = await client.from("student_progress").select("*").eq("student_id", studentId).maybeSingle();
  if (error) throw new Error(`Could not load progress: ${error.message}`);
  return toProgress((data as ProgressRow | null) ?? null);
}

type ProfileRow = { id: string; display_name: string; username: string; last_seen_at: string | null };

export async function listStudentsAtAGlance(client: SupabaseClient): Promise<GlanceRow[]> {
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, username, last_seen_at")
    .eq("role", "student")
    .eq("is_active", true)
    .order("display_name");
  if (error) throw new Error(`Could not load students: ${error.message}`);
  const students = (data ?? []) as ProfileRow[];
  if (students.length === 0) return [];
  const { data: prog, error: pErr } = await client
    .from("student_progress")
    .select("*")
    .in("student_id", students.map((s) => s.id));
  if (pErr) throw new Error(`Could not load progress: ${pErr.message}`);
  const byStudent = new Map(((prog ?? []) as ProgressRow[]).map((r) => [r.student_id, r]));
  return students.map((s) => ({
    studentId: s.id,
    displayName: s.display_name,
    username: s.username,
    lastSeenAt: s.last_seen_at,
    progress: toProgress(byStudent.get(s.id) ?? null),
  }));
}

export async function listMyHistory(client: SupabaseClient): Promise<StudentItem[]> {
  const { data, error } = await client.from("student_items").select("*").order("effective_due_at", { ascending: false });
  if (error) throw new Error(`Could not load history: ${error.message}`);
  return ((data ?? []) as unknown as ItemRow[]).map(mapStudentItem);
}

export async function listRecentlyMarked(client: SupabaseClient, limit = 3): Promise<StudentItem[]> {
  const { data, error } = await client
    .from("student_items")
    .select("*")
    .eq("is_marked", true)
    .order("marked_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load marked work: ${error.message}`);
  return ((data ?? []) as unknown as ItemRow[]).map(mapStudentItem);
}
