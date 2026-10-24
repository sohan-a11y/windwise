import { useId, useMemo, useRef, useState } from "react";
import type { HourRow } from "../../types";
import type { CoverTierId } from "../../lib/cover";
import { cn, gw, hourLabel, mw, signedGw } from "../../lib/format";
import { axisTicks, bandPath, clamp01, linePath, tickStep, ticks } from "./util";

const WIDTH = 960;
const HEIGHT = 404;
const PAD = { left: 56, right: 18, top: 30, bottom: 40 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

export function BandChart({
  hourly,
  tier,
  selectedHour,
  onSelect,
  showActual = true,
  className,
}: {
  hourly: HourRow[];
  tier: CoverTierId;
  selectedHour?: number | null;
  onSelect?: (hour: number) => void;
  showActual?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const maxima = hourly.flatMap((row) =>
    [row.forecast_mw, row.band95_high_mw, row.calibrated_mw, row.actual_mw].filter(
      (value): value is number => value !== null,
    ),
  );
  const minValue = hourly.reduce((min, row) => {
    const candidates = [row.band95_low_mw, row.calibrated_mw, row.actual_mw].filter(
      (value): value is number => value !== null,
    );
    return Math.min(min, ...candidates);
  }, Number.POSITIVE_INFINITY);
  const maxValue = Math.max(4000, ...maxima);
  const step = tickStep(maxValue);
  const yMax = Math.ceil((maxValue * 1.05) / step) * step;
  const yTicks = ticks(yMax, step);
  const yMin = Math.max(0, Math.floor((Math.min(0, minValue) * 1.02) / step) * step);

  const x = (hour: number) => PAD.left + (hour / Math.max(1, hourly.length - 1)) * PLOT_W;
  const y = (value: number) =>
    PAD.top + PLOT_H - ((value - yMin) / Math.max(1, yMax - yMin)) * PLOT_H;

  const points = useMemo(() => {
    const at = (value: number | null, hour: number) =>
      value === null ? null : { x: x(hour), y: y(value) };
    return {
      forecast: hourly.map((row) => at(row.forecast_mw, row.hour)),
      calibrated: hourly.map((row) => at(row.calibrated_mw, row.hour)),
      actual: hourly.map((row) => at(row.actual_mw, row.hour)),
      firm: hourly.map((row) => at(row.firm_mw[tier], row.hour)),
      band80: bandPath(
        hourly.map((row) => at(row.band80_high_mw, row.hour)),
        hourly.map((row) => at(row.band80_low_mw, row.hour)),
      ),
      band95: bandPath(
        hourly.map((row) => at(row.band95_high_mw, row.hour)),
        hourly.map((row) => at(row.band95_low_mw, row.hour)),
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourly, yMin, yMax]);

  const activeHour = hover ?? selectedHour ?? null;
  const active = activeHour === null ? null : hourly.find((row) => row.hour === activeHour) ?? null;
  const peak = hourly.reduce<HourRow | null>(
    (best, row) =>
      row.forecast_mw !== null && (!best || (best.forecast_mw ?? 0) < row.forecast_mw) ? row : best,
    null,
  );

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / rect.width) * WIDTH;
    if (relative < PAD.left - 12 || relative > WIDTH - PAD.right + 12) {
      setHover(null);
      return;
    }
    const ratio = clamp01((relative - PAD.left) / PLOT_W);
    const hour = Math.round(ratio * (hourly.length - 1));
    setHover(hourly[hour]?.hour ?? null);
  }

  const tooltipLeft = active ? (x(active.hour) / WIDTH) * 100 : 50;
  const forecastTone = hover !== null ? "text-ink" : "text-ink-400";

  return (
    <div className={cn("relative", className)}>
      <div className="relative" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-full w-full touch-none"
          role="img"
          aria-label="Hourly national wind: calibrated central forecast, 80 and 95 percent empirical bands, firm wind and outturn."
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
          onClick={() => active && onSelect?.(active.hour)}
        >
          <defs>
            <linearGradient id={`band80-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#45B6A2" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0E7C6B" stopOpacity="0.12" />
            </linearGradient>
            <linearGradient id={`band95-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5FC4E6" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#5FC4E6" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id={`actual-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F0705F" />
              <stop offset="100%" stopColor="#DE5A49" />
            </linearGradient>
          </defs>

          {/* grid */}
          {yTicks.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(value)}
                y2={y(value)}
                stroke="#0E2A2B"
                strokeOpacity={value === 0 ? 0.16 : 0.07}
                strokeDasharray={value === 0 ? undefined : "2 5"}
              />
              <text
                x={PAD.left - 12}
                y={y(value) + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="#7E9894"
              >
                {value === 0 ? "0" : `${value / 1000} GW`}
              </text>
            </g>
          ))}

          {/* bands */}
          {points.band95 ? <path d={points.band95} fill={`url(#band95-${uid})`} /> : null}
          {points.band80 ? (
            <path
              d={points.band80}
              fill={`url(#band80-${uid})`}
              stroke="#45B6A2"
              strokeOpacity="0.28"
            />
          ) : null}

          {/* firm wind */}
          {points.firm.some(Boolean) ? (
            <path
              d={linePath(points.firm)}
              fill="none"
              stroke="#B08A3E"
              strokeWidth="1.6"
              strokeDasharray="1 5"
              strokeLinecap="round"
            />
          ) : null}

          {/* forecast */}
          <path
            d={linePath(points.forecast)}
            fill="none"
            stroke="#7E9894"
            strokeWidth="1.8"
            strokeDasharray="6 5"
            strokeLinecap="round"
          />

          {/* calibrated */}
          <path
            d={linePath(points.calibrated)}
            fill="none"
            stroke="#0E7C6B"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* actual */}
          {showActual ? (
            <>
              <path
                d={linePath(points.actual)}
                fill="none"
                stroke={`url(#actual-${uid})`}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.actual.map((point, index) =>
                point ? (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={activeHour === hourly[index].hour ? 4.6 : 2.7}
                    fill="#F0705F"
                    stroke="#FDF6F4"
                    strokeWidth="1.4"
                  />
                ) : null,
              )}
            </>
          ) : null}

          {/* peak marker */}
          {peak && peak.forecast_mw !== null ? (
            <g pointerEvents="none">
              <line
                x1={x(peak.hour)}
                x2={x(peak.hour)}
                y1={y(peak.forecast_mw)}
                y2={y(peak.forecast_mw) - 20}
                stroke="#5B7B77"
                strokeOpacity="0.4"
              />
              <text
                x={x(peak.hour)}
                y={y(peak.forecast_mw) - 26}
                textAnchor={peak.hour > 17 ? "end" : peak.hour < 4 ? "start" : "middle"}
                fontSize="10"
                fill="#5B7B77"
              >
                peak {gw(peak.forecast_mw)}
              </text>
            </g>
          ) : null}

          {/* active rule */}
          {active ? (
            <g pointerEvents="none">
              <line
                x1={x(active.hour)}
                x2={x(active.hour)}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="#0E2A2B"
                strokeOpacity="0.18"
                strokeDasharray="3 4"
              />
              {active.calibrated_mw !== null ? (
                <circle cx={x(active.hour)} cy={y(active.calibrated_mw)} r="5.2" fill="#0E7C6B" stroke="#FFFFFF" strokeWidth="2" />
              ) : null}
            </g>
          ) : null}

          {/* x axis */}
          {axisTicks(hourly.length, 3).map((hour) => {
            const row = hourly[hour];
            if (!row) return null;
            return (
              <g key={hour}>
                <line
                  x1={x(row.hour)}
                  x2={x(row.hour)}
                  y1={PAD.top + PLOT_H}
                  y2={PAD.top + PLOT_H + 5}
                  stroke="#0E2A2B"
                  strokeOpacity="0.2"
                />
                <text
                  x={x(row.hour)}
                  y={PAD.top + PLOT_H + 22}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#7E9894"
                >
                  {hourLabel(row.hour)}
                </text>
              </g>
            );
          })}
          <text
            x={WIDTH - PAD.right}
            y={HEIGHT - 6}
            textAnchor="end"
            fontSize="9"
            fill="#A8BCB8"
          >
            delivery hour (UTC)
          </text>
        </svg>

        {active ? (
          <div
            className="chart-tooltip"
            style={{
              left: `${Math.min(82, Math.max(18, tooltipLeft))}%`,
              top: 6,
              transform: "translateX(-50%)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-teal-300">
                {hourLabel(active.hour)}
              </span>
              {showActual ? (
                <span className={cn("font-mono text-[10px]", forecastTone)}>
                  {signedGw(active.error_mw)} err
                </span>
              ) : null}
            </div>
            <div className="mt-2 space-y-1 text-[11px]">
              <Row label="Forecast" value={gw(active.forecast_mw)} tone="text-paper/70" />
              <Row label="Calibrated" value={gw(active.calibrated_mw)} tone="text-teal-300" />
              {showActual ? (
                <Row label="Actual" value={gw(active.actual_mw)} tone="text-coral-300" />
              ) : null}
              <Row label="Firm wind" value={gw(active.firm_mw[tier])} tone="text-sand-300" />
              <Row label="Cover" value={mw(active.cover_mw[tier])} tone="text-coral-300" />
            </div>
            <div className="mt-2 border-t border-white/10 pt-1.5 font-mono text-[9px] text-paper/40">
              80% band {gw(active.band80_low_mw)} – {gw(active.band80_high_mw)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-paper/45">{label}</span>
      <span className={cn("num", tone)}>{value}</span>
    </div>
  );
}
