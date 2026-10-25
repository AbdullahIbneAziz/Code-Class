"use server";

import { revalidatePath } from "next/cache";
import { teacherClient } from "@/lib/accounts/teacher-client";
import { rpcErrorMessage, type ActionResult } from "@/lib/db/errors";
import { parseMarkInput, REVISION_MESSAGE } from "@/lib/marking/format";

export type SaveMarkResult = ActionResult | { ok: false; message: string; code: "revision" };

export async function saveMarkAction(i: {
  submissionId: string;
  assignmentId: string;
  expectedRevision: number;
  mark: string;
  feedback: string;
}): Promise<SaveMarkResult> {
  const gate = await teacherClient();
  if (!gate.ok) return gate;
  const parsed = parseMarkInput(i.mark);
  if (!parsed.ok) return parsed;
  const { error } = await gate.client.rpc("save_mark", {
    p_submission_id: i.submissionId,
    p_expected_revision: i.expectedRevision,
    p_mark: parsed.mark,
    p_feedback: i.feedback,
  });
  if (error) {
    const message = rpcErrorMessage(error);
    return message === REVISION_MESSAGE ? { ok: false, message, code: "revision" } : { ok: false, message };
  }
  revalidatePath("/teacher");
  revalidatePath("/teacher/marking");
  revalidatePath(`/teacher/homework/${i.assignmentId}`);
  return { ok: true };
}
