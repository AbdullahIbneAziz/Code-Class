import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { mapStudentItem, type ItemRow } from "@/lib/homework/map";
import { hasPassed } from "@/lib/homework/status";
import type { StudentItem } from "@/lib/homework/types";

/** Submitted, unmarked, not excused, active student; oldest first. Tests still running are left out. */
export async function listMarkingQueue(client: SupabaseClient): Promise<StudentItem[]> {
  const { data, error } = await client
    .from("student_items")
    .select("*")
    .eq("has_submission", true)
    .eq("is_marked", false)
    .eq("is_excused", false)
    .eq("student_is_active", true)
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(`Could not load the marking queue: ${error.message}`);
  await connection(); // request time: the clock below must not be prerendered
  return ((data ?? []) as unknown as ItemRow[])
    .map(mapStudentItem)
    .filter((i) => i.kind !== "test" || hasPassed(i.effectiveDueAt));
}
