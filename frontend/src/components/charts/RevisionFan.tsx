import { useMemo, useRef, useState } from "react";
import type { SnapshotSeries } from "../../types";
import { cn, gw, hourLabel, signedGw } from "../../lib/format";
import { axisTicks, linePath, tickStep, ticks } from "./util";

const WIDTH = 960;
const HEIGHT = 400;
const PAD = { left: 56, right: 20, top: 26, bottom: 40 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

export function RevisionFan({
  series,
  actual,
  showAfter = true,
  className,
}: {
  series: SnapshotSeries[];
  actual: Array<number | null>;
  showAfter?: boolean;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(() => {
    const values = series.flatMap((item) => item.values);
    const observed = actual.filter((value): value is number => value !== null);
    return Math.max(4000, ...values, ...observed);
  }, [series, actual]);

  const step = tickStep(max);
  const yMax = Math.ceil((max * 1.05) / step) * step;
  const yTicks = ticks(yMax, step);
  const x = (hour: number) => PAD.left + (hour / 23) * PLOT_W;
  const y = (value: number) => PAD.top + PLOT_H - (value / yMax) * PLOT_H;

  const selected = series.find((item) => item.selected);
  const before = series.filter((item) => item.before_gate && !item.selected);
  const after = series.filter((item) => !item.before_gate);

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = Math.min(1, Math.max(0, (relative - PAD.left) / PLOT_W));
    setHover(Math.round(ratio * 23));
  }

  return (
    <div className={cn("relative", className)} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full touch-none"
        role="img"
        aria-label="Every full-coverage WINDFOR snapshot for the delivery day, with the selected pre-gate snapshot and actual outturn."
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="fan-actual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F0705F" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#F0705F" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="#0E2A2B"
              strokeOpacity="0.06"
              strokeDasharray="2 5"
            />
            <text x={PAD.left - 12} y={y(value) + 3.5} textAnchor="end" fontSize="10" fill="#7E9894">
              {value === 0 ? "0" : `${value / 1000} GW`}
            </text>
          </g>
        ))}

        {/* post-gate revisions */}
        {showAfter
          ? after.map((item) => (
              <path
                key={`after-${item.publish_time}`}
                d={linePath(item.values.map((value, hour) => ({ x: x(hour), y: y(value) })))}
                fill="none"
                stroke="#5FC4E6"
                strokeOpacity="0.28"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
            ))
          : null}

        {/* pre-gate revisions */}
        {before.map((item) => (
          <path
            key={`before-${item.publish_time}`}
            d={linePath(item.values.map((value, hour) => ({ x: x(hour), y: y(value) })))}
            fill="none"
            stroke="#7E9894"
            strokeOpacity="0.35"
            strokeWidth="1.1"
          />
        ))}

        {/* actual */}
        <path
          d={`${linePath(
            actual.map((value, hour) => (value === null ? null : { x: x(hour), y: y(value) })),
          )} L${x(23)} ${PAD.top + PLOT_H} L${x(0)} ${PAD.top + PLOT_H} Z`}
          fill="url(#fan-actual)"
        />
        <path
          d={linePath(actual.map((value, hour) => (value === null ? null : { x: x(hour), y: y(value) })))}
          fill="none"
          stroke="#F0705F"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* selected */}
        {selected ? (
          <path
            d={linePath(selected.values.map((value, hour) => ({ x: x(hour), y: y(value) })))}
            fill="none"
            stroke="#0E2A2B"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        ) : null}

        {hover !== null ? (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="#0E2A2B"
              strokeOpacity="0.18"
              strokeDasharray="3 4"
            />
            {selected && selected.values[hover] !== undefined ? (
              <circle cx={x(hover)} cy={y(selected.values[hover])} r="4.5" fill="#0E2A2B" stroke="#fff" strokeWidth="1.8" />
            ) : null}
            {actual[hover] !== null && actual[hover] !== undefined ? (
              <circle cx={x(hover)} cy={y(actual[hover] as number)} r="4.5" fill="#F0705F" stroke="#fff" strokeWidth="1.8" />
            ) : null}
          </g>
        ) : null}

        {axisTicks(24, 3).map((hour) => (
          <g key={hour}>
            <line
              x1={x(hour)}
              x2={x(hour)}
              y1={PAD.top + PLOT_H}
              y2={PAD.top + PLOT_H + 5}
              stroke="#0E2A2B"
              strokeOpacity="0.18"
            />
            <text
              x={x(hour)}
              y={PAD.top + PLOT_H + 21}
              textAnchor="middle"
              fontSize="10"
              fill="#7E9894"
            >
              {hourLabel(hour)}
            </text>
          </g>
        ))}
      </svg>

      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-2 rounded-xl border border-white/90 bg-ink/95 px-3 py-2 text-[10px] text-paper shadow-soft"
          style={{
            left: `${Math.min(84, Math.max(16, (x(hover) / WIDTH) * 100))}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-mono uppercase tracking-[0.14em] text-teal-300">
            {hourLabel(hover)}
          </div>
          <div className="mt-1 space-y-0.5">
            {selected ? (
              <div className="flex justify-between gap-5">
                <span className="text-paper/50">Selected</span>
                <span className="num">{gw(selected.values[hover])}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-5">
              <span className="text-paper/50">Actual</span>
              <span className="num text-coral-300">{gw(actual[hover])}</span>
            </div>
            {selected ? (
              <div className="flex justify-between gap-5">
                <span className="text-paper/50">Error</span>
                <span className="num">{signedGw((selected.values[hover] ?? 0) - (actual[hover] ?? 0))}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
