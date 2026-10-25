"use client";

import { useState } from "react";
import { signedDownloadUrl } from "@/lib/files/download";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function DownloadButton({
  bucket,
  objectPath,
  downloadName,
  label = "Download",
}: {
  bucket: string;
  objectPath: string;
  downloadName: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className="rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await signedDownloadUrl(createBrowserSupabase(), bucket, objectPath, downloadName);
          setBusy(false);
          if (r.ok) window.location.assign(r.url);
          else setError(r.message);
        }}
      >
        {label}
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
