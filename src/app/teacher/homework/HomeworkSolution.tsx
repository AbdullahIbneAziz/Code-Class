"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadButton } from "@/components/DownloadButton";
import { uploadAndAttach, uploadAndReplace } from "@/lib/files/attach";
import type { FileRow } from "@/lib/files/types";
import { ALLOWED_EXT, BUCKET, validateFile } from "@/lib/files/rules";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { useHydrated } from "@/lib/ui/useHydrated";

const btn = "rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";
const ACCEPT = ALLOWED_EXT.solution.map((e) => "." + e).join(",");

export function HomeworkSolution({ assignmentId, solution }: { assignmentId: string; solution: FileRow | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const label = solution ? "Replace solution" : "Upload solution";

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const f = el.files?.[0];
    el.value = "";
    if (!f) return;
    setError(null);
    const v = validateFile(f, "solution");
    if (!v.ok) {
      setError(v.message);
      return;
    }
    startTransition(async () => {
      const client = createBrowserSupabase();
      const onProgress = (x: number) => setProgress(Math.round(x * 100));
      const r = solution
        ? await uploadAndReplace(client, { target: "solution", parentId: assignmentId, fileId: solution.id, file: f, onProgress })
        : await uploadAndAttach(client, { target: "solution", parentId: assignmentId, file: f, onProgress });
      setProgress(null);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Solution</h2>
      {solution ? (
        <p className="mt-1">
          <span className="mr-3">{solution.originalName}</span>
          <DownloadButton bucket={BUCKET.solution} objectPath={solution.objectPath} downloadName={solution.originalName} />
        </p>
      ) : (
        <p className="mt-1 opacity-70">No solution uploaded yet.</p>
      )}
      <div className="mt-2">
        <button type="button" disabled={!hydrated || pending} className={btn} onClick={() => ref.current?.click()}>
          {label}
        </button>
        <input ref={ref} type="file" accept={ACCEPT} aria-label={label} className="hidden" onChange={onPick} />
      </div>
      {progress !== null && (
        <p role="status" className="text-sm">
          Uploading… {progress}%
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
      <p className="mt-2 text-sm opacity-80">
        Students see the solution once their own deadline has passed and they have submitted, been excused, or you have
        unlocked it for everyone.
      </p>
    </section>
  );
}
