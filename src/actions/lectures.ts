"use server";

import { revalidatePath } from "next/cache";
import { teacherClient } from "@/lib/accounts/teacher-client";
import { rpcErrorMessage, type ActionResult } from "@/lib/db/errors";

function refresh() {
  revalidatePath("/teacher/lectures");
  revalidatePath("/lectures");
}

export async function createLectureAction(i: {
  title: string;
  description: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const client = gate.client;
  const { data, error } = await client.rpc("create_lecture", { p_title: i.title, p_description: i.description });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh();
  return { ok: true, id: data as string };
}

export async function updateLectureAction(i: { id: string; title: string; description: string }): Promise<ActionResult> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const client = gate.client;
  const { error } = await client.rpc("update_lecture", {
    p_lecture_id: i.id,
    p_title: i.title,
    p_description: i.description,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh();
  return { ok: true };
}

export async function deleteLectureAction(id: string): Promise<ActionResult> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const client = gate.client;
  const { error } = await client.rpc("delete_lecture", { p_lecture_id: id });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh();
  return { ok: true };
}
