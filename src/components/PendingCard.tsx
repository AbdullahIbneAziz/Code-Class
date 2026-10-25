import Link from "next/link";
import { DownloadButton } from "@/components/DownloadButton";
import { BUCKET } from "@/lib/files/rules";
import type { FileRow } from "@/lib/files/types";
import type { StudentItem } from "@/lib/homework/types";
import { dueLabel } from "@/lib/time/uk";

export function PendingCard({ item, file, now }: { item: StudentItem; file?: FileRow; now: Date }) {
  return (
    <li className="rounded border border-black/15 p-4 dark:border-white/20">
      <span className="block text-lg font-semibold">{item.title}</span>
      <span className="block text-sm">
        {item.actionState === "missed" ? "LATE, " : ""}
        {dueLabel(new Date(item.effectiveDueAt), now)}
      </span>
      <span className="mt-3 flex flex-wrap items-center gap-2">
        {file && <DownloadButton bucket={BUCKET.question} objectPath={file.objectPath} downloadName={file.originalName} />}
        <Link
          href={`/homework/${item.assignmentId}#your-work`}
          className="rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
        >
          Upload
        </Link>
      </span>
    </li>
  );
}
