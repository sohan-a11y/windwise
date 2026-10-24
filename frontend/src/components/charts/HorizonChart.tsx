import type { HorizonBucket } from "../../types";
import { cn } from "../../lib/format";

const WIDTH = 720;
const HEIGHT = 260;
const PAD = { left: 44, right: 16, top: 20, bottom: 34 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

export function HorizonChart({
  buckets,
  className,
}: {
  buckets: HorizonBucket[];
  className?: string;
}) {
  const max = Math.max(
    3000,
    ...buckets.flatMap((bucket) => [bucket.mae_mw, Math.abs(bucket.bias_mw)]),
  );
  const ceiling = Math.ceil(max / 500) * 500 + 250;
  const x = (index: number) =>
    PAD.left + (buckets.length <= 1 ? PLOT_W / 2 : (index / (buckets.length - 1)) * PLOT_W);
  const y = (value: number) => PAD.top + PLOT_H - (value / ceiling) * PLOT_H;

  const mae = buckets
    .map((bucket, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(bucket.mae_mw).toFixed(1)}`)
    .join(" ");
  const bias = buckets
    .map((bucket, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(Math.abs(bucket.bias_mw)).toFixed(1)}`)
    .join(" ");
  const area = `${mae} L${x(buckets.length - 1)} ${PAD.top + PLOT_H} L${PAD.left} ${PAD.top + PLOT_H} Z`;

  return (
    <div className={cn("relative", className)} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label="Forecast MAE and absolute bias by lead time to the target hour."
      >
        <defs>
          <linearGradient id="horizon-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0E7C6B" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0E7C6B" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1000, 2000, 3000].filter((value) => value <= ceiling).map((value) => (
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
            <text x={PAD.left - 9} y={y(value) + 3.5} textAnchor="end" fontSize="9" fill="#7E9894">
              {value / 1000} GW
            </text>
          </g>
        ))}

        <path d={area} fill="url(#horizon-fill)" />
        <path d={bias} fill="none" stroke="#F0705F" strokeWidth="1.6" strokeDasharray="4 4" strokeLinecap="round" />
        <path d={mae} fill="none" stroke="#0E7C6B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

        {buckets.map((bucket, index) => (
          <g key={bucket.from_hours}>
            <title>{`${bucket.from_hours}–${bucket.to_hours}h · MAE ${Math.round(bucket.mae_mw)} MW · bias ${Math.round(bucket.bias_mw)} MW · n=${bucket.n}`}</title>
            <circle cx={x(index)} cy={y(bucket.mae_mw)} r="3.4" fill="#0E7C6B" stroke="#fff" strokeWidth="1.4" />
            <circle cx={x(index)} cy={y(Math.abs(bucket.bias_mw))} r="2.4" fill="#F0705F" />
            {index % 2 === 0 ? (
              <text x={x(index)} y={HEIGHT - 8} textAnchor="middle" fontSize="8" fill="#7E9894">
                {bucket.from_hours}–{bucket.to_hours}h
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
