import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn, dateLong, gw, mw, pct, weekday } from "../lib/format";
import type { DayStatus, GateId, GateInfo, MetaDate } from "../types";

type IconName =
  | "wind"
  | "arrow-right"
  | "arrow-left"
  | "chevron-down"
  | "download"
  | "eye"
  | "eye-off"
  | "external"
  | "info"
  | "alert"
  | "check"
  | "calendar"
  | "clock"
  | "spark"
  | "lock"
  | "table"
  | "github"
  | "api"
  | "close"
  | "minus"
  | "plus";

const ICON_PATHS: Record<IconName, ReactNode> = {
  wind: (
    <>
      <path d="M3 8h9.5a2.5 2.5 0 1 0-2.4-3.2" />
      <path d="M3 12h13a2.5 2.5 0 1 1-2.4 3.2" />
      <path d="M3 16h7.5a2 2 0 1 1-2 2.6" />
    </>
  ),
  "arrow-right": <path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" />,
  "arrow-left": <path d="M16 10H4m4.5-4.5L4 10l4.5 4.5" />,
  "chevron-down": <path d="m6 8 4 4 4-4" />,
  download: (
    <>
      <path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5" />
      <path d="M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" />
    </>
  ),
  eye: (
    <>
      <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" />
      <circle cx="10" cy="10" r="2.2" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M3 3l14 14" />
      <path d="M7.5 5.6A9.7 9.7 0 0 1 10 5c5 0 8 5 8 5a14 14 0 0 1-2.3 2.7M5.1 7.1A14.6 14.6 0 0 0 2 10s3 5 8 5a9 9 0 0 0 3-.5" />
    </>
  ),
  external: (
    <>
      <path d="M11 3h6v6m0-6-8 8" />
      <path d="M17 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v4.5M10 6.5h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10 3.2 18 17H2L10 3.2Z" />
      <path d="M10 8v4M10 14.5h.01" />
    </>
  ),
  check: <path d="m4 10.5 4 4 8-9" />,
  calendar: (
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8h14M7 3v3m6-3v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" />
    </>
  ),
  spark: (
    <>
      <path d="M10 2.5c.7 4.4 2.6 6.3 7 7-4.4.7-6.3 2.6-7 7-.7-4.4-2.6-6.3-7-7 4.4-.7 6.3-2.6 7-7Z" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 8h14M8 8v9" />
    </>
  ),
  github: (
    <path d="M10 2.2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.7-.9-3.7-4 0-.9.3-1.6.8-2.2-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.7 7.7 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.2 0 3.1-1.9 3.8-3.7 4 .3.3.6.8.6 1.6v2.2c0 .3.1.5.5.4A8 8 0 0 0 10 2.2Z" />
  ),
  api: (
    <>
      <path d="M6.5 5.5 3 10l3.5 4.5M13.5 5.5 17 10l-3.5 4.5M11.5 3l-3 14" />
    </>
  ),
  close: <path d="m5 5 10 10M15 5 5 15" />,
  minus: <path d="M5 10h10" />,
  plus: <path d="M10 5v10M5 10h10" />,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="17" fill="#0E2A2B" />
      <circle cx="32" cy="32" r="21" stroke="#8AD4C5" strokeOpacity=".3" />
      <g fill="#F3F6F1">
        <path d="M32 32c0-9 4.2-15 10.2-16.4 1 6.3-2.3 12.4-10.2 16.4Z" />
        <path
          d="M32 32c7.9 4.4 10.8 10.8 9.2 17-5.8-2.6-8.9-8.8-9.2-17Z"
          fill="#8AD4C5"
        />
        <path
          d="M32 32c-4.3 7.9-10.8 10.8-17 9.2 2.7-5.8 8.8-8.9 17-9.2Z"
          fill="#F3D488"
        />
      </g>
      <circle cx="32" cy="32" r="3.2" fill="#F0705F" />
    </svg>
  );
}

export function Eyebrow({
  children,
  light = false,
  className,
}: {
  children: ReactNode;
  light?: boolean;
  className?: string;
}) {
  return <div className={cn(light ? "label-light" : "label", className)}>{children}</div>;
}

export function SectionHeading({
  kicker,
  title,
  description,
  action,
  id,
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" id={id}>
      <div className="max-w-2xl">
        {kicker ? <Eyebrow className="mb-2">{kicker}</Eyebrow> : null}
        <h2 className="display text-[clamp(1.9rem,3.4vw,3rem)] leading-[1.02]">{title}</h2>
        {description ? (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  delta,
  tone = "ink",
  spark,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  delta?: string;
  tone?: "ink" | "teal" | "coral" | "sky";
  spark?: ReactNode;
  className?: string;
}) {
  const toneClass = {
    ink: "text-ink",
    teal: "text-teal-700",
    coral: "text-coral-600",
    sky: "text-sky-600",
  }[tone];
  return (
    <div className={cn("card group p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] tracking-tight",
              delta.startsWith("-") || delta.startsWith("−")
                ? "bg-teal-100 text-teal-700"
                : "bg-coral-100 text-coral-600",
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className={cn("num text-[clamp(1.6rem,2.5vw,2.2rem)] font-medium tracking-[-0.04em]", toneClass)}>
          {value}
        </span>
        {unit ? <span className="font-mono text-xs text-ink-500">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 text-xs leading-relaxed text-ink-500">{sub}</div> : null}
      {spark ? <div className="mt-4 h-9">{spark}</div> : null}
    </div>
  );
}

export function Sparkline({
  values,
  color = "#0E7C6B",
  fill = true,
  className,
}: {
  values: Array<number | null>;
  color?: string;
  fill?: boolean;
  className?: string;
}) {
  const numeric = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (numeric.length < 2) return <div className={className} />;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      if (value === null) return null;
      const x = (index / (values.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 26 - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
  const gradientId = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 34"
      preserveAspectRatio="none"
      className={cn("h-full w-full overflow-visible", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? (
        <polygon points={`0,34 ${points} 100,34`} fill={`url(#${gradientId})`} />
      ) : null}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MiniBars({
  values,
  color = "#0E7C6B",
  highlight,
}: {
  values: Array<number | null>;
  color?: string;
  highlight?: number;
}) {
  const numeric = values.filter((value): value is number => value !== null);
  const max = Math.max(...numeric, 1);
  return (
    <div className="flex h-full items-end gap-[2px]" aria-hidden="true">
      {values.map((value, index) => (
        <div
          key={index}
          className="flex-1 rounded-t-[2px] transition-opacity"
          style={{
            height: `${Math.max(4, ((value ?? 0) / max) * 100)}%`,
            backgroundColor: color,
            opacity: highlight === index ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className,
}: {
  options: Array<{ value: T; label: ReactNode; sublabel?: ReactNode; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-full border border-ink-200/70 bg-white/55 p-1 backdrop-blur",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full transition-colors duration-200 disabled:opacity-35",
              size === "sm" ? "px-3 py-1.5" : "px-4 py-2",
              active ? "text-ink" : "text-ink-500 hover:text-ink",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-[0_4px_16px_-8px_rgba(14,42,43,0.5)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
            <span className="relative flex flex-col items-center leading-tight">
              <span className="text-xs font-medium">{option.label}</span>
              {option.sublabel ? (
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400">
                  {option.sublabel}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StatusChip({
  status,
  label,
  className,
}: {
  status: DayStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
        status === "calibrated"
          ? "border-teal-200 bg-teal-100/80 text-teal-700"
          : "border-sand-300 bg-sand-200 text-ink-700",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "calibrated" ? "bg-teal-500" : "bg-coral-400",
        )}
      />
      {label ?? (status === "calibrated" ? "Calibrated" : "Provisional")}
    </span>
  );
}

export function DateControl({
  value,
  dates,
  onChange,
  compact = false,
}: {
  value: string;
  dates: MetaDate[];
  onChange: (date: string) => void;
  compact?: boolean;
}) {
  const index = dates.findIndex((item) => item.date === value);
  const dateRow = dates[index];
  const previous = dates[Math.max(0, index - 1)]?.date;
  const next = dates[Math.min(dates.length - 1, index + 1)]?.date;

  return (
    <div className="flex max-w-full flex-col gap-1.5">
      <Eyebrow>Delivery date</Eyebrow>
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          className="btn-quiet h-9 w-9 shrink-0 rounded-full border border-ink-200/60 bg-white/50 disabled:opacity-40"
          aria-label="Previous delivery day"
          disabled={!previous || previous === value}
          onClick={() => previous && onChange(previous)}
        >
          <Icon name="arrow-left" size={15} />
        </button>
        <div className="relative min-w-0">
          <select
            aria-label="Delivery date"
            className={cn(
              "select-quiet w-full max-w-full",
              compact ? "w-[170px]" : "w-[214px] sm:w-[240px]",
            )}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            {dates.map((item) => (
              <option key={item.date} value={item.date}>
                {weekday(item.date)} {dateLong(item.date)}
                {item.status === "provisional" ? " · provisional" : ""}
              </option>
            ))}
          </select>
          {dateRow?.fallback ? (
            <span
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-coral-500 ring-2 ring-white"
              title="This day needed a snapshot fallback"
            />
          ) : null}
        </div>
        <button
          type="button"
          className="btn-quiet h-9 w-9 shrink-0 rounded-full border border-ink-200/60 bg-white/50 disabled:opacity-40"
          aria-label="Next delivery day"
          disabled={!next || next === value}
          onClick={() => next && onChange(next)}
        >
          <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </div>
  );
}

export function GateControl({
  value,
  gates,
  onChange,
  compact = false,
}: {
  value: GateId;
  gates: GateInfo[];
  onChange: (gate: GateId) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto">
      <Eyebrow>Market gate</Eyebrow>
      <div
        role="radiogroup"
        aria-label="Market gate"
        className="flex w-full min-w-0 rounded-2xl border border-ink-200/70 bg-white/55 p-1 backdrop-blur sm:inline-flex sm:w-fit"
      >
        {gates.map((gate) => {
          const active = gate.id === value;
          return (
            <button
              key={gate.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(gate.id)}
              className={cn(
                "min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition-all duration-200 sm:flex-none sm:px-3",
                compact ? "sm:min-w-[92px]" : "sm:min-w-[112px]",
                active
                  ? "bg-ink text-paper shadow-lift"
                  : "text-ink-500 hover:bg-white/80 hover:text-ink",
              )}
            >
              <span className="block text-[11px] font-medium leading-tight">{gate.market}</span>
              <span
                className={cn(
                  "mt-0.5 block font-mono text-[10px] tracking-[0.06em]",
                  active ? "text-teal-300" : "text-ink-400",
                )}
              >
                {gate.closure_label} gate
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  tone = "coral",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  tone?: "coral" | "teal";
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-ink-500">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200",
          checked
            ? tone === "coral"
              ? "border-coral-500 bg-coral-500"
              : "border-teal-500 bg-teal-500"
            : "border-ink-300 bg-ink-100",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm",
            checked ? "left-[26px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function ProgressBar({
  value,
  target,
  tone = "teal",
}: {
  value: number;
  target?: number;
  tone?: "teal" | "coral" | "sand";
}) {
  const color = tone === "coral" ? "bg-coral-500" : tone === "sand" ? "bg-sand-500" : "bg-teal-500";
  return (
    <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-100">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className={cn("h-full rounded-full", color)}
      />
      {target !== undefined ? (
        <div
          className="absolute inset-y-0 w-px bg-ink/70"
          style={{ left: `${Math.max(0, Math.min(100, target))}%` }}
          title={`Target: ${target}%`}
        />
      ) : null}
    </div>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      role="note"
      aria-label={text}
      title={text}
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-ink-400 transition-colors hover:text-teal-600"
    >
      <Icon name="info" size={13} />
    </span>
  );
}

export function Metric({
  label,
  raw,
  calibrated,
  formatter = (value: number) => gw(value),
  goodWhenDown = true,
  className,
}: {
  label: string;
  raw: number | null;
  calibrated: number | null;
  formatter?: (value: number) => string;
  goodWhenDown?: boolean;
  className?: string;
}) {
  const improved =
    raw !== null && calibrated !== null
      ? goodWhenDown
        ? calibrated < raw
        : calibrated > raw
      : null;
  return (
    <div className={cn("border-t border-ink-100 pt-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        {raw !== null && calibrated !== null ? (
          <span
            className={cn(
              "font-mono text-[10px]",
              improved ? "text-teal-600" : "text-coral-500",
            )}
          >
            {improved ? "improved" : "watch"}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="num text-lg text-ink">{formatter(calibrated ?? raw ?? 0)}</span>
        {raw !== null ? (
          <span className="num text-[11px] text-ink-400 line-through decoration-ink-300">
            {formatter(raw)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function MetricPair({
  label,
  raw,
  calibrated,
  formatter = (value) => gw(value),
}: {
  label: string;
  raw: number | null;
  calibrated: number | null;
  formatter?: (value: number) => string;
}) {
  return (
    <div>
      <div className="label mb-2">{label}</div>
      <div className="flex items-end gap-1.5">
        <span className="num text-lg leading-none">{formatter(calibrated ?? raw ?? 0)}</span>
        {raw !== null && calibrated !== null ? (
          <span className="num text-[10px] leading-none text-ink-400">was {formatter(raw)}</span>
        ) : null}
      </div>
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("card p-6", className)}>
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-5 h-8 w-36" />
      <div className="skeleton mt-3 h-3 w-44" />
      <div className="skeleton mt-6 h-24 w-full" />
    </div>
  );
}

export function LoadingPage({ label = "Loading the decision brief" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-teal-500" />
        <span className="label">{label}</span>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        <div className="card p-8 lg:col-span-7">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton mt-6 h-16 w-[85%]" />
          <div className="skeleton mt-3 h-16 w-[60%]" />
          <div className="skeleton mt-8 h-4 w-2/3" />
          <div className="skeleton mt-2 h-4 w-1/2" />
          <div className="skeleton mt-10 h-12 w-full" />
        </div>
        <div className="card min-h-[280px] p-6 lg:col-span-5">
          <div className="skeleton h-full min-h-[240px] w-full" />
        </div>
        {[0, 1, 2, 3].map((item) => (
          <SkeletonCard key={item} className="lg:col-span-3" />
        ))}
      </div>
    </div>
  );
}

export function ErrorPanel({
  title = "The desk could not load",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-coral-200 bg-coral-100 text-coral-600">
        <Icon name="alert" size={24} />
      </div>
      <h2 className="display mt-6 text-3xl">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-600">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-primary mt-6" onClick={onRetry}>
          Try again
          <Icon name="arrow-right" size={15} />
        </button>
      ) : null}
    </div>
  );
}

export function SampleNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-500">
      <Icon name="info" size={14} className="mt-0.5 shrink-0 text-ink-400" />
      <span>{children}</span>
    </p>
  );
}

export function KpiInline({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "teal" | "coral";
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div
        className={cn(
          "num mt-1.5 text-xl",
          tone === "teal" ? "text-teal-700" : tone === "coral" ? "text-coral-600" : "text-ink",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function RangeLabel({
  low,
  high,
  digits = 1,
}: {
  low: number | null;
  high: number | null;
  digits?: number;
}) {
  if (low === null || high === null) return <span className="text-ink-300">—</span>;
  return (
    <span className="num">
      {gw(low, digits)} <span className="text-ink-300">–</span> {gw(high, digits)}
    </span>
  );
}

export function CoverageBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className="font-mono text-[10px] text-ink-400">
      realised {pct(value, 0)}
    </span>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <a href={href} className="group flex items-center gap-3 no-underline" aria-label="Windwise home">
      <Logo />
      <span>
        <span className="block text-[17px] font-semibold leading-none tracking-[-0.02em] text-ink">
          Windwise
        </span>
        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
          Day-ahead wind intelligence
        </span>
      </span>
    </a>
  );
}

export function SnapshotStamp({
  time,
  minutes,
  gateLabel,
}: {
  time: string;
  minutes: number;
  gateLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-ink-200 bg-white/70">
        <span className="absolute inset-1 rounded-full border border-dashed border-teal-300" />
        <Icon name="clock" size={17} className="text-teal-700" />
      </div>
      <div>
        <div className="font-mono text-[13px] leading-none text-ink">{time} snapshot</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-500">
          {minutes} min before {gateLabel}
        </div>
      </div>
    </div>
  );
}

export function useMotionEnabled() {
  const reduce = useReducedMotion();
  return !reduce;
}

export function BigNumber({
  value,
  unit,
  label,
  hint,
  tone = "ink",
}: {
  value: string;
  unit?: string;
  label?: string;
  hint?: string;
  tone?: "ink" | "teal" | "coral";
}) {
  return (
    <div>
      {label ? <div className="label mb-2">{label}</div> : null}
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "num text-[clamp(2.4rem,4vw,3.6rem)] font-medium leading-[0.9] tracking-[-0.05em]",
            tone === "teal" ? "text-teal-700" : tone === "coral" ? "text-coral-600" : "text-ink",
          )}
        >
          {value}
        </span>
        {unit ? <span className="font-mono text-xs text-ink-500">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-2 text-xs leading-relaxed text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("hairline", className)} />;
}

export function Tag({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "teal" | "coral" | "sand" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]",
        tone === "teal"
          ? "bg-teal-100 text-teal-700"
          : tone === "coral"
            ? "bg-coral-100 text-coral-600"
            : tone === "sand"
              ? "bg-sand-200 text-ink-700"
              : "bg-ink-100 text-ink-600",
      )}
    >
      {children}
    </span>
  );
}

export { mw, gw };
