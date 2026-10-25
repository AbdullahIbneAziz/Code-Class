import { formatBd, formatUkWithZone } from "@/lib/time/uk";

export function UkTime({ at, teacher = false }: { at: string; teacher?: boolean }) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <time dateTime={d.toISOString()}>
      {formatUkWithZone(d)} <span className="text-xs opacity-60">UK time</span>
      {teacher && <span className="text-xs text-gray-500"> · {formatBd(d)} BD</span>}
    </time>
  );
}
