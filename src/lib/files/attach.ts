import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcErrorMessage, type ActionResult } from "@/lib/db/errors";
import { BUCKET, newObjectPath, validateFile } from "./rules";
import { uploadObject } from "./upload";

type Target = "lecture" | "question" | "solution";
type Progress = (fraction: number) => void;

export async function uploadAndAttach(
  client: SupabaseClient,
  i: { target: Target; parentId: string; file: File; onProgress?: Progress },
): Promise<{ ok: true; fileId: string } | { ok: false; message: string }> {
  const v = validateFile(i.file, i.target);
  if (!v.ok) return v;
  const path = newObjectPath(i.parentId, v.ext);
  const up = await uploadObject(client, BUCKET[i.target], path, i.file, i.onProgress);
  if (!up.ok) return up;
  const { data, error } = await client.rpc("attach_file", {
    p_target: i.target,
    p_parent_id: i.parentId,
    p_object_path: path,
    p_original_name: i.file.name,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  return { ok: true, fileId: data as string };
}

export async function uploadAndReplace(
  client: SupabaseClient,
  i: { target: Target; parentId: string; fileId: string; file: File; onProgress?: Progress },
): Promise<ActionResult> {
  const v = validateFile(i.file, i.target);
  if (!v.ok) return v;
  const path = newObjectPath(i.parentId, v.ext);
  const up = await uploadObject(client, BUCKET[i.target], path, i.file, i.onProgress);
  if (!up.ok) return up;
  const { error } = await client.rpc("replace_file", {
    p_target: i.target,
    p_file_id: i.fileId,
    p_object_path: path,
    p_original_name: i.file.name,
  });
  if (error) return { ok: false, message: rpcErrorMessage(error) };
  return { ok: true };
}
