import { useState } from "react";
import type { HeatCell } from "../../types";
import { cn, dateShort, gw, hourLabel, weekday } from "../../lib/format";

function cellStyle(value: number | null): React.CSSProperties {
  if (value === null) return { background: "rgba(14,42,43,0.04)" };
  const magnitude = Math.min(1, Math.abs(value) / 6000);
  const alpha = 0.08 + magnitude * 0.82;
  const rgb = value >= 0 ? "240,112,95" : "14,124,107";
  return { background: `rgba(${rgb},${alpha.toFixed(3)})` };
}

export function ErrorHeatmap({
  cells,
  className,
}: {
  cells: HeatCell[];
  className?: string;
}) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  const days = Array.from(new Set(cells.map((cell) => cell.date))).sort();
  const lookup = new Map(cells.map((cell) => [`${cell.date}-${cell.hour}`, cell]));

  return (
    <div className={cn("", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-h-[20px] font-mono text-[11px] text-ink-600">
          {hover ? (
            <span>
              <span className="text-ink">{dateShort(hover.date)}</span> · {hourLabel(hover.hour)} ·{" "}
              <span className={hover.raw_error_mw && hover.raw_error_mw > 0 ? "text-coral-600" : "text-teal-700"}>
                {gw(hover.raw_error_mw)}
              </span>{" "}
              <span className="text-ink-400">raw error</span>
            </span>
          ) : (
            <span className="text-ink-400">Hover a cell · raw forecast minus actual</span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
          <span>under</span>
          <span className="flex">
            {[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((value) => (
              <span
                key={value}
                className="h-2.5 w-4 first:rounded-l-full last:rounded-r-full"
                style={cellStyle(value * 5500)}
              />
            ))}
          </span>
          <span>over</span>
        </div>
      </div>

      <div className="thin-scrollbar overflow-x-auto pb-1">
        <div className="min-w-[560px]">
          <div
            className="grid items-center gap-[2px]"
            style={{ gridTemplateColumns: `34px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div />
            {days.map((day, index) => (
              <div key={day} className="text-center">
                {index % 5 === 0 ? (
                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-ink-400">
                    {weekday(day).slice(0, 2)}
                  </span>
                ) : null}
              </div>
            ))}

            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="contents">
                <div className="pr-2 text-right font-mono text-[8px] text-ink-400">
                  {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                </div>
                {days.map((day) => {
                  const cell = lookup.get(`${day}-${hour}`) ?? null;
                  const value = cell?.raw_error_mw ?? null;
                  return (
                    <button
                      type="button"
                      key={`${day}-${hour}`}
                      aria-label={`${day} ${hourLabel(hour)} error ${gw(value)}`}
                      title={`${dateShort(day)} ${hourLabel(hour)} · ${gw(value)}`}
                      onMouseEnter={() => cell && setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => cell && setHover(cell)}
                      onBlur={() => setHover(null)}
                      className="aspect-square w-full rounded-[2px] transition-transform duration-100 hover:z-10 hover:scale-[1.35] focus-visible:z-10 focus-visible:scale-[1.35]"
                      style={cellStyle(value)}
                    />
                  );
                })}
              </div>
            ))}

            <div />
            {days.map((day) => (
              <div
                key={`label-${day}`}
                className="pt-1 text-center font-mono text-[8px] text-ink-400"
              >
                {day.slice(8) === "01" || Number(day.slice(8)) % 5 === 0 ? Number(day.slice(8)) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
