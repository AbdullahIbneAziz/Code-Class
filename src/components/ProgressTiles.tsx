import { formatPct } from "@/lib/progress/format";
import type { Progress } from "@/lib/progress/types";

export function ProgressTiles({ progress }: { progress: Progress }) {
  const tiles = [
    `${progress.submitted} Submitted`,
    `${progress.late} Late`,
    `${progress.missed} Missed`,
    `${formatPct(progress.hwAvgPct)} HW avg`,
    `${formatPct(progress.testAvgPct)} Test avg`,
  ];
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map((t) => (
        <div key={t} className="rounded border border-black/15 p-3 text-center text-sm font-medium dark:border-white/20">
          {t}
        </div>
      ))}
    </div>
  );
}
