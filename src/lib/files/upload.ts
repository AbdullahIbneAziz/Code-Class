import type { SupabaseClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import type { ActionResult } from "@/lib/db/errors";

export const TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;

const REFUSED = "The upload was refused. The file may be the wrong type or too big, or uploads may be closed.";
const FAILED = "The upload failed. Check your internet connection and try again.";

function failureMessage(status: number | undefined): string {
  return status !== undefined && status >= 400 && status < 500 ? REFUSED : FAILED;
}

/** Uploads straight to Supabase Storage with the user's session. Never overwrites (upsert: false). */
export async function uploadObject(
  client: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<ActionResult> {
  const contentType = file.type || "application/octet-stream";
  if (file.size <= TUS_THRESHOLD_BYTES) {
    const { error } = await client.storage.from(bucket).upload(path, file, { upsert: false, contentType });
    if (error) {
      const status = (error as { statusCode?: string | number }).statusCode;
      return { ok: false, message: failureMessage(status === undefined ? undefined : Number(status)) };
    }
    onProgress?.(1);
    return { ok: true };
  }

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, message: FAILED };

  return new Promise<ActionResult>((resolve) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
      metadata: { bucketName: bucket, objectName: path, contentType, cacheControl: "3600" },
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 3000, 5000, 10000],
      onError(err) {
        const status = (err as { originalResponse?: { getStatus(): number } | null }).originalResponse?.getStatus();
        resolve({ ok: false, message: failureMessage(status) });
      },
      onProgress(sent, total) {
        if (total > 0) onProgress?.(sent / total);
      },
      onSuccess() {
        onProgress?.(1);
        resolve({ ok: true });
      },
    });
    upload.start();
  });
}
