"use server";

import { revalidatePath } from "next/cache";
import { teacherClient } from "@/lib/accounts/teacher-client";
import { rpcErrorMessage, type ActionResult } from "@/lib/db/errors";
import type { HomeworkFormState } from "@/lib/homework/types";
import { readUkField } from "@/lib/time/form";

function refresh(id?: string) {
  revalidatePath("/teacher/homework");
  if (id) revalidatePath(`/teacher/homework/${id}`);
}

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}

/** Reads both UK fields, collecting every zone choice before reporting. */
function readTimes(
  fd: FormData,
):
  | { ok: true; visibleFrom: string | null; due: string }
  | { ok: false; message: string; zoneChoice?: ("visibleFrom" | "due")[] } {
  const v = readUkField(fd, "visibleFrom", { optional: true });
  const d = readUkField(fd, "due", { optional: false });
  const zoneChoice: ("visibleFrom" | "due")[] = [];
  if (!v.ok && v.needsZoneChoice) zoneChoice.push("visibleFrom");
  if (!d.ok && d.needsZoneChoice) zoneChoice.push("due");
  if (!v.ok || !d.ok) {
    const failed = [v, d].filter((x) => !x.ok);
    const first = failed.find((x) => !x.needsZoneChoice) ?? failed[0];
    const message = first && !first.ok ? first.message : "Please enter a valid date and time.";
    return zoneChoice.length ? { ok: false, message, zoneChoice } : { ok: false, message };
  }
  return { ok: true, visibleFrom: v.instant ? v.instant.toISOString() : null, due: d.instant!.toISOString() };
}

function maxMarks(fd: FormData): number {
  const n = Number(str(fd, "maxMarks"));
  return Number.isFinite(n) ? n : 0;
}

export async function createHomeworkAction(fd: FormData): Promise<HomeworkFormState> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const client = gate.client;
  const times = readTimes(fd);
  if (!times.ok) return times;
  const studentIds = fd.getAll("studentIds").filter((x): x is string => typeof x === "string");
  const { data, error } = await client.rpc("create_assignment", {
    p_kind: "homework",
    p_title: str(fd, "title"),
    p_instructions: str(fd, "instructions"),
    p_max_marks: maxMarks(fd),
    p_visible_from: times.visibleFrom,
    p_opens_at: null,
    p_due_at: times.due,
    p_student_ids: studentIds,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh();
  return { ok: true, id: data as string };
}

export async function updateHomeworkAction(fd: FormData): Promise<HomeworkFormState> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const client = gate.client;
  const id = str(fd, "id");
  const times = readTimes(fd);
  if (!times.ok) return times;
  const { error } = await client.rpc("update_assignment", {
    p_assignment_id: id,
    p_title: str(fd, "title"),
    p_instructions: str(fd, "instructions"),
    p_max_marks: maxMarks(fd),
    p_visible_from: times.visibleFrom, // null = unchanged (also when the field is locked and not sent)
    p_opens_at: null,
    p_due_at: times.due,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh(id);
  return { ok: true, id };
}

export async function deleteHomeworkAction(id: string): Promise<ActionResult> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const client = gate.client;
  const { error } = await client.rpc("delete_assignment", { p_assignment_id: id });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh();
  return { ok: true };
}

export async function setHomeworkStudentsAction(id: string, studentIds: string[]): Promise<ActionResult> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const client = gate.client;
  const { error } = await client.rpc("set_assignment_students", { p_assignment_id: id, p_student_ids: studentIds });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh(id);
  return { ok: true };
}

export async function unlockSolutionForAllAction(id: string): Promise<ActionResult> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const client = gate.client;
  const { error } = await client.rpc("unlock_solution_for_all", { p_assignment_id: id });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  revalidatePath("/teacher");
  refresh(id);
  return { ok: true };
}
