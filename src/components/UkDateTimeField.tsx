import { parseUkLocal, type UkZone } from "@/lib/time/uk";

const input = "mt-1 rounded border border-black/20 bg-transparent px-3 py-2 dark:border-white/25";

export function UkDateTimeField({
  name,
  label,
  optional = false,
  defaultValue,
  needsZoneChoice = false,
}: {
  name: string;
  label: string;
  optional?: boolean;
  defaultValue?: { date: string; time: string; zone: UkZone };
  needsZoneChoice?: boolean;
}) {
  // A stored time that falls in the repeated hour must keep its zone on re-save.
  const defaultAmbiguous =
    !!defaultValue && parseUkLocal(defaultValue.date, defaultValue.time).ok === false &&
    (parseUkLocal(defaultValue.date, defaultValue.time) as { reason: string }).reason === "ambiguous";
  const showZone = needsZoneChoice || defaultAmbiguous;
  const zoneDefault = defaultAmbiguous ? defaultValue.zone : undefined;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">
        {label} <span className="text-xs opacity-60">(UK time{optional ? ", optional" : ""})</span>
      </legend>
      <div className="flex flex-wrap gap-3">
        <input
          type="date"
          name={`${name}Date`}
          aria-label={`${label} date`}
          defaultValue={defaultValue?.date}
          required={!optional}
          className={input}
        />
        <input
          type="time"
          name={`${name}Time`}
          aria-label={`${label} time`}
          defaultValue={defaultValue?.time}
          required={!optional}
          className={input}
        />
      </div>
      {showZone && (
        <fieldset className="text-sm">
          <legend className="font-medium">BST (first time) or GMT (second time)?</legend>
          <label className="mr-4">
            <input type="radio" name={`${name}Zone`} value="BST" defaultChecked={zoneDefault === "BST"} required /> BST (first time)
          </label>
          <label>
            <input type="radio" name={`${name}Zone`} value="GMT" defaultChecked={zoneDefault === "GMT"} required /> GMT (second time)
          </label>
        </fieldset>
      )}
    </fieldset>
  );
}
