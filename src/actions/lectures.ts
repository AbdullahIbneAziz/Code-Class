"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/accounts/guard";
import { rpcErrorMessage, type ActionResult } from "@/lib/db/errors";
import { createServerSupabase } from "@/lib/supabase/server";

async function teacherClient() {
  const client = await createServerSupabase();
  try {
    await requireTeacher(client);
  } catch {
    return null;
  }
  return client;
}

const NOPE = { ok: false as const, message: "You don't have permission to do that." };

function refresh() {
  revalidatePath("/teacher/lectures");
  revalidatePath("/lectures");
}

export async function createLectureAction(i: {
  title: string;
  description: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const client = await teacherClient();
  if (!client) return NOPE;
  const { data, error } = await client.rpc("create_lecture", { p_title: i.title, p_description: i.description });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh();
  return { ok: true, id: data as string };
}

export async function updateLectureAction(i: { id: string; title: string; description: string }): Promise<ActionResult> {
  const client = await teacherClient();
  if (!client) return NOPE;
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
  const client = await teacherClient();
  if (!client) return NOPE;
  const { error } = await client.rpc("delete_lecture", { p_lecture_id: id });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  refresh();
  return { ok: true };
}
