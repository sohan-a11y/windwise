import type { HistogramBin } from "../../types";
import { cn } from "../../lib/format";

const WIDTH = 720;
const HEIGHT = 300;
const PAD = { left: 34, right: 16, top: 18, bottom: 38 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

export function HistogramChart({
  bins,
  className,
}: {
  bins: HistogramBin[];
  className?: string;
}) {
  const maxCount = Math.max(1, ...bins.map((bin) => Math.max(bin.raw, bin.calibrated)));
  const bandWidth = PLOT_W / Math.max(1, bins.length);
  const barWidth = Math.max(3, bandWidth - 2.5);
  const centre = (bin: HistogramBin) => PAD.left + (bins.indexOf(bin) + 0.5) * bandWidth;
  const zeroIndex = bins.findIndex((bin) => bin.from_mw <= 0 && bin.to_mw > 0);
  const zeroX = zeroIndex >= 0 ? PAD.left + zeroIndex * bandWidth + ((0 - bins[zeroIndex].from_mw) / (bins[zeroIndex].to_mw - bins[zeroIndex].from_mw)) * bandWidth : PAD.left;

  const labelIndices = bins
    .map((bin, index) => ({ bin, index }))
    .filter(({ bin }) => bin.from_mw % 2000 === 0);

  return (
    <div className={cn("relative", className)} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label="Distribution of hourly forecast errors before and after calibration."
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={PAD.top + PLOT_H * (1 - fraction)}
              y2={PAD.top + PLOT_H * (1 - fraction)}
              stroke="#0E2A2B"
              strokeOpacity="0.06"
              strokeDasharray="2 5"
            />
            <text
              x={PAD.left - 8}
              y={PAD.top + PLOT_H * (1 - fraction) + 3.5}
              textAnchor="end"
              fontSize="9"
              fill="#7E9894"
            >
              {Math.round(maxCount * fraction)}
            </text>
          </g>
        ))}

        {bins.map((bin) => {
          const rawHeight = (bin.raw / maxCount) * PLOT_H;
          const calibratedHeight = (bin.calibrated / maxCount) * PLOT_H;
          const cx = centre(bin);
          return (
            <g key={bin.from_mw}>
              <title>
                {`${bin.from_mw / 1000} to ${bin.to_mw / 1000} GW error · raw ${bin.raw} · calibrated ${bin.calibrated}`}
              </title>
              <rect
                x={cx - barWidth}
                y={PAD.top + PLOT_H - rawHeight}
                width={barWidth}
                height={rawHeight}
                rx="1.5"
                fill="#CBD9D5"
                fillOpacity="0.85"
              />
              <rect
                x={cx - barWidth / 2}
                y={PAD.top + PLOT_H - calibratedHeight}
                width={barWidth}
                height={calibratedHeight}
                rx="1.5"
                fill={bin.from_mw >= 0 ? "#F0705F" : "#0E7C6B"}
                fillOpacity="0.8"
              />
            </g>
          );
        })}

        <line
          x1={zeroX}
          x2={zeroX}
          y1={PAD.top}
          y2={PAD.top + PLOT_H}
          stroke="#0E2A2B"
          strokeOpacity="0.4"
        />
        <text x={zeroX} y={PAD.top - 6} textAnchor="middle" fontSize="9" fill="#5B7B77">
          zero error
        </text>

        {labelIndices.map(({ bin, index }) => (
          <text
            key={bin.from_mw}
            x={PAD.left + (index + 0.5) * bandWidth}
            y={PAD.top + PLOT_H + 18}
            textAnchor="middle"
            fontSize="9"
            fill="#7E9894"
          >
            {bin.from_mw === 0 ? "0" : `${bin.from_mw > 0 ? "+" : ""}${bin.from_mw / 1000}`}
          </text>
        ))}
        <text
          x={PAD.left + PLOT_W}
          y={HEIGHT - 6}
          textAnchor="end"
          fontSize="9"
          fill="#A8BCB8"
        >
          forecast − actual (GW)
        </text>
      </svg>
    </div>
  );
}
