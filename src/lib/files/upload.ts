import type { SupabaseClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import type { ActionResult } from "@/lib/db/errors";

export const TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;

const REFUSED = "The upload was refused. The file may be the wrong type or too big, or uploads may be closed.";
const FAILED = "The upload failed. Check your internet connection and try again.";

function failureMessage(status: number | undefined): string {
  return status !== undefined && status >= 400 && status < 500 ? REFUSED : FAILED;
}

/** TUS options. The token is read per request (never baked in) so a long upload survives a session refresh. */
export function tusOptions(
  client: SupabaseClient,
  bucket: string,
  path: string,
  contentType: string,
  cb: { onProgress: (fraction: number) => void; onSuccess: () => void; onError: (status: number | undefined) => void },
): tus.UploadOptions {
  // onShouldRetry is synchronous in tus-js-client, so the refresh is started there and awaited before the retry's request.
  let refreshing: Promise<unknown> | null = null;
  return {
    endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
    headers: { "x-upsert": "false" },
    metadata: { bucketName: bucket, objectName: path, contentType, cacheControl: "3600" },
    chunkSize: 6 * 1024 * 1024,
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    retryDelays: [0, 3000, 5000, 10000],
    async onBeforeRequest(req) {
      if (refreshing) {
        await refreshing;
        refreshing = null;
      }
      const { data } = await client.auth.getSession();
      req.setHeader("authorization", `Bearer ${data.session?.access_token ?? ""}`);
    },
    onShouldRetry(err, retryAttempt, options) {
      const status = (err as { originalResponse?: { getStatus(): number } | null }).originalResponse?.getStatus();
      if ((status === 401 || status === 403) && retryAttempt === 0) {
        refreshing = client.auth.refreshSession().catch(() => undefined);
        return true;
      }
      return tus.defaultOptions.onShouldRetry!(err, retryAttempt, options);
    },
    onError(err) {
      cb.onError((err as { originalResponse?: { getStatus(): number } | null }).originalResponse?.getStatus());
    },
    onProgress(sent, total) {
      if (total > 0) cb.onProgress(sent / total);
    },
    onSuccess() {
      cb.onProgress(1);
      cb.onSuccess();
    },
  };
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

  return new Promise<ActionResult>((resolve) => {
    const upload = new tus.Upload(
      file,
      tusOptions(client, bucket, path, contentType, {
        onProgress: (fraction) => onProgress?.(fraction),
        onSuccess: () => resolve({ ok: true }),
        onError: (status) => resolve({ ok: false, message: failureMessage(status) }),
      }),
    );
    upload.start();
  });
}
