import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcErrorMessage } from "@/lib/db/errors";
import { BUCKET, newObjectPath, validateFile } from "./rules";
import { uploadObject } from "./upload";

/**
 * Uploads a student's file, then asks the database to finalize it. The deadline rules live in
 * finalize_submission. If it refuses, the uploaded object is left for Phase 5 clean-up and the
 * previous submission is untouched.
 */
export async function uploadAndFinalize(
  client: SupabaseClient,
  i: { assignmentId: string; studentId: string; file: File; onProgress?: (fraction: number) => void },
): Promise<{ ok: true; submissionId: string } | { ok: false; message: string }> {
  const v = validateFile(i.file, "submission");
  if (!v.ok) return v;
  const path = newObjectPath(`${i.assignmentId}/${i.studentId}`, v.ext);
  const up = await uploadObject(client, BUCKET.submission, path, i.file, i.onProgress);
  if (!up.ok) return up;
  const { data, error } = await client.rpc("finalize_submission", {
    p_assignment_id: i.assignmentId,
    p_object_path: path,
    p_original_name: i.file.name,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  return { ok: true, submissionId: data as string };
}
