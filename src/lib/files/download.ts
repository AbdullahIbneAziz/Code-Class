import type { SupabaseClient } from "@supabase/supabase-js";

/** 60-second signed URL from the user-scoped client; the browser saves it under the original name. */
export async function signedDownloadUrl(
  client: SupabaseClient,
  bucket: string,
  objectPath: string,
  downloadName: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, 60, { download: downloadName });
  if (error || !data?.signedUrl) return { ok: false, message: "You can't download this file right now." };
  return { ok: true, url: data.signedUrl };
}
