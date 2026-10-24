import { useId, useMemo, useState } from "react";
import type { HourRow } from "../types";
import type { CoverTierId } from "../lib/cover";
import { cn, gw, hourLabel, mw } from "../lib/format";

interface Block {
  from: number;
  to: number;
  forecast: number | null;
  calibrated: number | null;
  low: number | null;
  high: number | null;
  actual: number | null;
  cover: number | null;
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function blockify(hourly: HourRow[], tier: CoverTierId): Block[] {
  const blocks: Block[] = [];
  for (let start = 0; start < hourly.length; start += 2) {
    const rows = hourly.slice(start, start + 2);
    if (rows.length === 0) continue;
    blocks.push({
      from: rows[0].hour,
      to: rows[rows.length - 1].hour,
      forecast: average(rows.map((row) => row.forecast_mw)),
      calibrated: average(rows.map((row) => row.calibrated_mw)),
      low: average(rows.map((row) => row.band80_low_mw)),
      high: average(rows.map((row) => row.band80_high_mw)),
      actual: average(rows.map((row) => row.actual_mw)),
      cover: average(rows.map((row) => row.cover_mw[tier])),
    });
  }
  return blocks;
}

export function Windscape({
  hourly,
  tier,
  onSelect,
  className,
}: {
  hourly: HourRow[];
  tier: CoverTierId;
  onSelect?: (hour: number) => void;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const blocks = useMemo(() => blockify(hourly, tier), [hourly, tier]);
  const [hovered, setHovered] = useState<number | null>(null);
  const activeBlock = hovered === null ? null : blocks[hovered];

  const maxima = blocks.flatMap((block) =>
    [block.forecast, block.calibrated, block.high, block.actual].filter(
      (value): value is number => value !== null,
    ),
  );
  const ceiling = Math.max(1, ...maxima);
  const coverMax = Math.max(1, ...blocks.map((block) => block.cover ?? 0));
  const count = Math.max(blocks.length, 1);

  const scene = useMemo(() => {
    return blocks.map((block, index) => {
      const t = count === 1 ? 0.5 : index / (count - 1);
      const x = 76 + t * 800;
      const baseY = 438 - t * 34 - Math.sin(t * Math.PI) * 54;
      const scale = 1.04 - t * 0.2;
      const value = block.forecast ?? 0;
      const calibrated = block.calibrated ?? value;
      const tower = 26 + (value / ceiling) * 168 * scale;
      const lowY = 26 + ((block.low ?? value) / ceiling) * 168 * scale;
      const highY = 26 + ((block.high ?? value) / ceiling) * 168 * scale;
      return { block, index, t, x, baseY, scale, tower, lowY, highY, calibrated };
    });
  }, [blocks, ceiling, count]);

  // A faint second rank sits behind the data-bearing row to give the scene depth.
  const distance = useMemo(
    () =>
      Array.from({ length: 11 }, (_, index) => {
        const t = index / 10;
        const x = 34 + t * 892;
        const baseY = 322 - t * 54 - Math.sin(t * Math.PI) * 18;
        const scale = 0.34 + Math.sin(t * Math.PI) * 0.06;
        const tower = 72 + Math.sin(index * 1.7) * 12;
        return { x, baseY, scale, tower };
      }),
    [],
  );

  const ridge = scene
    .map((item, index) => `${index === 0 ? "M" : "L"}${item.x.toFixed(1)} ${item.baseY.toFixed(1)}`)
    .join(" ");
  const ridgeArea = `${ridge} L${scene[scene.length - 1]?.x ?? 0} 500 L${scene[0]?.x ?? 0} 500 Z`;

  const bandTop = scene
    .map((item, index) => `${index === 0 ? "M" : "L"}${item.x.toFixed(1)} ${(item.baseY - item.highY).toFixed(1)}`)
    .join(" ");
  const bandBottom = [...scene]
    .reverse()
    .map((item) => `L${item.x.toFixed(1)} ${(item.baseY - item.lowY).toFixed(1)}`)
    .join(" ");
  const bandPath = scene.length > 1 ? `${bandTop} ${bandBottom} Z` : "";

  const calibratedPath =
    scene.length > 1
      ? scene
          .map((item, index) => {
            const y = item.baseY - (26 + (item.calibrated / ceiling) * 168 * item.scale);
            return `${index === 0 ? "M" : "L"}${item.x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ")
      : "";

  const reserve = scene.map((item) => {
    const height = 4 + ((item.block.cover ?? 0) / coverMax) * 34;
    return { ...item, reserveHeight: height };
  });

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox="0 0 960 520"
        className="h-full w-full"
        role="group"
        aria-label="Isometric windscape of the delivery day: one turbine per two-hour block, tower height proportional to national wind."
      >
        <defs>
          <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EAF4F1" />
            <stop offset="52%" stopColor="#F6F8F2" />
            <stop offset="100%" stopColor="#EDF5F1" />
          </linearGradient>
          <linearGradient id={`ground-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#DCEDE6" />
            <stop offset="55%" stopColor="#CBE4DA" />
            <stop offset="100%" stopColor="#B9DBD0" />
          </linearGradient>
          <linearGradient id={`band-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5FC4E6" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#0E7C6B" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id={`pole-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#25504E" />
            <stop offset="45%" stopColor="#0E2A2B" />
            <stop offset="100%" stopColor="#3C6562" />
          </linearGradient>
          <linearGradient id={`reserve-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#DE5A49" />
            <stop offset="100%" stopColor="#F9BBB2" />
          </linearGradient>
          <linearGradient id={`calibrated-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0E7C6B" />
            <stop offset="100%" stopColor="#45B6A2" />
          </linearGradient>
          <radialGradient id={`sun-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FBE9B8" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#F3D488" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#F3D488" stopOpacity="0" />
          </radialGradient>
          <filter id={`blur-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        <rect width="960" height="520" fill={`url(#sky-${uid})`} />

        {/* sun and haze */}
        <circle cx="772" cy="104" r="120" fill={`url(#sun-${uid})`} />
        <circle cx="772" cy="104" r="27" fill="#F7E3AE" opacity="0.85" />
        <circle cx="772" cy="104" r="27" fill="none" stroke="#EBCB84" strokeOpacity="0.5" />
        <ellipse cx="240" cy="96" rx="118" ry="17" fill="#FFFFFF" opacity="0.65" />
        <ellipse cx="300" cy="112" rx="74" ry="12" fill="#FFFFFF" opacity="0.5" />
        <ellipse cx="620" cy="66" rx="96" ry="13" fill="#FFFFFF" opacity="0.45" />

        {/* horizon */}
        <path
          d={`M0 330 C 180 292, 360 300, 520 286 C 690 271, 810 286, 960 268 L960 520 L0 520 Z`}
          fill={`url(#ground-${uid})`}
        />
        <path
          d={`M0 330 C 180 292, 360 300, 520 286 C 690 271, 810 286, 960 268`}
          fill="none"
          stroke="#8FC5B5"
          strokeOpacity="0.7"
        />

        {/* perspective grid */}
        <g stroke="#FFFFFF" strokeOpacity="0.5">
          {[352, 386, 424, 466, 510].map((y, index) => (
            <path
              key={y}
              d={`M0 ${y + index * 2} C 240 ${y - 26 + index * 3}, 640 ${y - 10 + index * 2}, 960 ${y - 34}`}
              fill="none"
              strokeWidth="1"
            />
          ))}
          {[90, 210, 340, 470, 610, 750, 880].map((x) => (
            <path
              key={x}
              d={`M${x} 325 L${520 + (x - 520) * 1.9} 520`}
              fill="none"
              strokeWidth="0.8"
              strokeOpacity="0.35"
            />
          ))}
        </g>

        {/* wind streamlines */}
        <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
          <path d="M-20 190 C 180 160, 300 214, 470 186 S 760 132, 990 168" strokeWidth="2.4" strokeOpacity="0.85" />
          <path
            d="M-20 226 C 160 204, 330 250, 520 218 S 780 176, 990 206"
            strokeWidth="1.4"
            strokeOpacity="0.6"
            className="streamline"
          />
          <path
            d="M-20 264 C 220 246, 360 288, 560 252 S 800 216, 990 244"
            strokeWidth="1"
            strokeOpacity="0.45"
            className="streamline"
            style={{ animationDuration: "22s" }}
          />
        </g>
        <g stroke="#0E7C6B" strokeOpacity="0.22" fill="none">
          <path d="M330 250 C 420 236, 500 246, 566 236" strokeWidth="1.4" />
          <path d="M600 206 C 680 196, 740 204, 806 192" strokeWidth="1.2" />
        </g>

        {/* ridge */}
        <path d={ridgeArea} fill="#0E7C6B" fillOpacity="0.07" />
        <path d={ridge} fill="none" stroke="#0E7C6B" strokeOpacity="0.35" strokeDasharray="2 6" />

        {/* calibrated band ribbon */}
        {bandPath ? (
          <path d={bandPath} fill={`url(#band-${uid})`} stroke="#5FC4E6" strokeOpacity="0.22" />
        ) : null}
        {calibratedPath ? (
          <path
            d={calibratedPath}
            fill="none"
            stroke={`url(#calibrated-${uid})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity="0.65"
            strokeDasharray="1 0"
          />
        ) : null}

        {/* distant rank */}
        <g opacity="0.3">
          {distance.map((item, index) => {
            const blade = 34 * item.scale;
            return (
              <g key={`distance-${index}`}>
                <path
                  d={`M${item.x - 1.4} ${item.baseY} L${item.x - 0.8} ${
                    item.baseY - item.tower
                  } L${item.x + 0.8} ${item.baseY - item.tower} L${item.x + 1.4} ${
                    item.baseY
                  } Z`}
                  fill="#25504E"
                />
                <g transform={`translate(${item.x}, ${item.baseY - item.tower})`}>
                  <g
                    className="rotor"
                    style={{ animationDuration: `${21 + (index % 4) * 4}s` }}
                  >
                    {[0, 120, 240].map((angle) => (
                      <path
                        key={angle}
                        transform={`rotate(${angle})`}
                        d={`M0 0 C ${1.2 * item.scale} ${-blade * 0.24}, ${
                          0.9 * item.scale
                        } ${-blade * 0.78}, 0 ${-blade} C ${-0.8 * item.scale} ${
                          -blade * 0.76
                        }, ${-1 * item.scale} ${-blade * 0.22}, 0 0 Z`}
                        fill="#25504E"
                      />
                    ))}
                  </g>
                  <circle r={1.8 * item.scale} fill="#25504E" />
                </g>
              </g>
            );
          })}
        </g>

        {/* turbines */}
        {reserve.map((item) => {
          const { block, index, x, baseY, scale, tower } = item;
          const blade = 38 * scale;
          const label = `${hourLabel(block.from)}–${hourLabel(block.to + 1)}`;
          const isActive = hovered === index;
          return (
            <g
              key={block.from}
              role="button"
              tabIndex={0}
              aria-label={`${label}: forecast ${gw(block.forecast)}, calibrated ${gw(
                block.calibrated,
              )}, cover ${mw(block.cover)}`}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect?.(block.from)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(block.from);
                }
              }}
              className="cursor-pointer outline-none"
            >
              <ellipse
                cx={x}
                cy={baseY + 3}
                rx={22 * scale}
                ry={6 * scale}
                fill="#0E2A2B"
                opacity={isActive ? 0.18 : 0.1}
              />
              {/* thermal reserve column */}
              <g opacity={0.9}>
                <rect
                  x={x + 13 * scale}
                  y={baseY - item.reserveHeight}
                  width={5.5 * scale}
                  height={item.reserveHeight}
                  rx={2.6 * scale}
                  fill={`url(#reserve-${uid})`}
                />
                <circle
                  cx={x + 15.75 * scale}
                  cy={baseY - item.reserveHeight}
                  r={3.6 * scale}
                  fill="#F0705F"
                  opacity={isActive ? 0.55 : 0.26}
                />
              </g>
              {/* tower */}
              <path
                d={`M${x - 3.4 * scale} ${baseY} L${x - 1.7 * scale} ${baseY - tower} L${
                  x + 1.7 * scale
                } ${baseY - tower} L${x + 3.4 * scale} ${baseY} Z`}
                fill={`url(#pole-${uid})`}
              />
              <g transform={`translate(${x}, ${baseY - tower})`}>
                <g
                  className="rotor"
                  style={{
                    animationDuration: `${15 + (index % 5) * 3}s`,
                    animationDirection: index % 2 === 0 ? "normal" : "reverse",
                  }}
                >
                  {[0, 120, 240].map((angle) => (
                    <path
                      key={angle}
                      transform={`rotate(${angle})`}
                      d={`M0 0 C ${1.6 * scale} ${-blade * 0.24}, ${1.1 * scale} ${-blade * 0.78}, 0 ${-blade} C ${-0.9 * scale} ${-blade * 0.76}, ${-1.2 * scale} ${-blade * 0.22}, 0 0 Z`}
                      fill={isActive ? "#0E7C6B" : "#173C3B"}
                      opacity={0.92}
                    />
                  ))}
                </g>
                <circle r={3.2 * scale} fill="#F3F6F1" stroke="#173C3B" strokeWidth="1.4" />
                <circle r={1.1 * scale} fill="#0E7C6B" />
              </g>
              {isActive ? (
                <g>
                  <circle
                    cx={x}
                    cy={baseY - tower}
                    r={blade + 9}
                    fill="none"
                    stroke="#0E7C6B"
                    strokeOpacity="0.35"
                    strokeDasharray="2 5"
                  />
                  <line
                    x1={x}
                    y1={baseY - tower}
                    x2={x}
                    y2={baseY}
                    stroke="#0E7C6B"
                    strokeOpacity="0.18"
                  />
                </g>
              ) : null}
            </g>
          );
        })}

        {/* foreground contour lines */}
        <g fill="none" stroke="#0E7C6B" strokeOpacity="0.14">
          <path d="M-20 470 C 200 440, 420 470, 620 448 S 860 430, 990 442" />
          <path d="M-20 500 C 220 474, 440 500, 660 480 S 880 466, 990 474" />
        </g>

        {/* annotation */}
        <g>
          <text x="40" y="44" fill="#5B7B77" fontSize="11" letterSpacing="0.18em">
            NATIONAL WIND · 24H OUTLOOK
          </text>
          <text x="40" y="66" fill="#0E2A2B" fontSize="15" fontFamily="Instrument Sans, sans-serif">
            Tower height = forecast wind
          </text>
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="rounded-2xl border border-white/70 bg-white/70 px-3.5 py-2.5 backdrop-blur-md">
          {activeBlock ? (
            <>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">
                {hourLabel(activeBlock.from)}–{hourLabel(activeBlock.to + 1)} · national
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="num text-lg text-ink">{gw(activeBlock.forecast, 2)}</span>
                <span className="font-mono text-[10px] text-teal-700">
                  calibrated {gw(activeBlock.calibrated, 2)}
                </span>
                <span className="font-mono text-[10px] text-coral-600">
                  cover {mw(activeBlock.cover)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">
                Hover or focus a turbine
              </div>
              <div className="mt-1 text-xs text-ink-600">
                Two-hour blocks · red column is thermal cover at your share
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-500 backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> calibrated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-coral-500" /> cover
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3 bg-sky-400" /> 80% band
          </span>
        </div>
      </div>
    </div>
  );
}
