import { useMemo, useState } from "react";
import type { ScatterPoint } from "../../types";
import { cn, gw } from "../../lib/format";
import { tickStep, ticks } from "./util";

const WIDTH = 560;
const HEIGHT = 470;
const PAD = { left: 52, right: 20, top: 24, bottom: 44 };
const PLOT = WIDTH - PAD.left - PAD.right;

export function ScatterChart({
  points,
  mode,
  className,
}: {
  points: ScatterPoint[];
  mode: "raw" | "calibrated";
  className?: string;
}) {
  const [hover, setHover] = useState<ScatterPoint | null>(null);

  const maximum = useMemo(() => {
    const values = points.flatMap((point) =>
      mode === "raw" ? [point.forecast_mw, point.actual_mw] : [point.calibrated_mw ?? point.forecast_mw, point.actual_mw],
    );
    return Math.max(18000, ...values);
  }, [points, mode]);
  const step = tickStep(maximum);
  const max = Math.ceil((maximum * 1.04) / step) * step;
  const tickValues = ticks(max, step);

  const x = (value: number) => PAD.left + (value / max) * PLOT;
  const y = (value: number) => PAD.top + PLOT - (value / max) * PLOT;

  return (
    <div className={cn("relative", className)} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label={`Scatter of ${mode} hourly forecast against actual national wind, January 2026.`}
      >
        <defs>
          <clipPath id="scatter-clip">
            <rect x={PAD.left} y={PAD.top} width={PLOT} height={PLOT} />
          </clipPath>
        </defs>

        {tickValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT}
              y1={y(value)}
              y2={y(value)}
              stroke="#0E2A2B"
              strokeOpacity="0.06"
              strokeDasharray="2 5"
            />
            <line
              x1={x(value)}
              x2={x(value)}
              y1={PAD.top + PLOT}
              y2={PAD.top}
              stroke="#0E2A2B"
              strokeOpacity="0.04"
            />
            <text x={PAD.left - 10} y={y(value) + 3.5} textAnchor="end" fontSize="9" fill="#7E9894">
              {value === 0 ? "0" : `${value / 1000}`}
            </text>
            <text x={x(value)} y={PAD.top + PLOT + 18} textAnchor="middle" fontSize="9" fill="#7E9894">
              {value === 0 ? "0" : `${value / 1000}`}
            </text>
          </g>
        ))}

        <text
          x={PAD.left - 10}
          y={PAD.top - 8}
          textAnchor="end"
          fontSize="9"
          fill="#A8BCB8"
        >
          GW
        </text>
        <text
          x={PAD.left + PLOT}
          y={HEIGHT - 8}
          textAnchor="end"
          fontSize="9"
          fill="#A8BCB8"
        >
          actual GW
        </text>
        <text
          x={PAD.left - 34}
          y={PAD.top + 4}
          transform={`rotate(-90 ${PAD.left - 34} ${PAD.top + 4})`}
          fontSize="9"
          fill="#A8BCB8"
          textAnchor="end"
        >
          forecast GW
        </text>

        <g clipPath="url(#scatter-clip)">
          {/* perfect forecast */}
          <line
            x1={x(0)}
            y1={y(0)}
            x2={x(max)}
            y2={y(max)}
            stroke="#0E2A2B"
            strokeOpacity="0.3"
            strokeDasharray="5 5"
          />
          {mode === "calibrated"
            ? points.map((point) =>
                point.calibrated_mw === null ? null : (
                  <circle
                    key={`raw-ghost-${point.date}-${point.hour}`}
                    cx={x(point.forecast_mw)}
                    cy={y(point.actual_mw)}
                    r="2.2"
                    fill="#7E9894"
                    fillOpacity="0.18"
                  />
                ),
              )
            : null}
          {[...points]
            .sort((a, b) => (hover === a ? 1 : hover === b ? -1 : 0))
            .map((point) => {
              const forecast = mode === "raw" ? point.forecast_mw : point.calibrated_mw;
              if (forecast === null) return null;
              const active = hover === point;
              return (
                <circle
                  key={`${point.date}-${point.hour}`}
                  cx={x(forecast)}
                  cy={y(point.actual_mw)}
                  r={active ? 5 : 2.8}
                  fill={mode === "raw" ? "#173C3B" : "#0E7C6B"}
                  fillOpacity={active ? 1 : 0.42}
                  stroke={active ? "#FFFFFF" : "none"}
                  strokeWidth="1.6"
                  onMouseEnter={() => setHover(point)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-crosshair"
                />
              );
            })}
        </g>

        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT}
          height={PLOT}
          fill="none"
          stroke="#0E2A2B"
          strokeOpacity="0.14"
        />
      </svg>

      {hover ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/90 bg-ink/95 px-3 py-2 text-[10px] text-paper shadow-soft">
          <div className="font-mono uppercase tracking-[0.14em] text-teal-300">
            {hover.date} · {String(hover.hour).padStart(2, "0")}:00
          </div>
          <div className="mt-1 space-y-0.5">
            <div className="flex gap-4 justify-between">
              <span className="text-paper/50">Forecast</span>
              <span className="num">{gw(hover.forecast_mw)}</span>
            </div>
            {hover.calibrated_mw !== null ? (
              <div className="flex gap-4 justify-between">
                <span className="text-paper/50">Calibrated</span>
                <span className="num text-teal-300">{gw(hover.calibrated_mw)}</span>
              </div>
            ) : null}
            <div className="flex gap-4 justify-between">
              <span className="text-paper/50">Actual</span>
              <span className="num text-coral-300">{gw(hover.actual_mw)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
