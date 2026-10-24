import { useState } from "react";
import type { MetaResponse } from "../types";
import type { NavigateOptions, Route } from "../lib/route";
import {
  cn,
  dateShort,
  formatNumber,
  gw,
  hourLabel,
  mw,
  pct,
  signedGw,
} from "../lib/format";
import { exportUrl } from "../api";
import { useAccuracy } from "../hooks";
import {
  ErrorPanel,
  GateControl,
  Icon,
  InfoTip,
  KpiInline,
  LoadingPage,
  SectionHeading,
  Segmented,
  StatCard,
} from "../components/ui";
import { ScatterChart } from "../components/charts/ScatterChart";
import { HistogramChart } from "../components/charts/HistogramChart";
import { ErrorHeatmap } from "../components/charts/ErrorHeatmap";
import { HorizonChart } from "../components/charts/HorizonChart";
import { Reveal } from "../components/Reveal";

const SECTIONS = [
  { id: "error", label: "Error" },
  { id: "coverage", label: "Coverage" },
  { id: "horizon", label: "Horizon" },
  { id: "gates", label: "Gates" },
  { id: "daily", label: "Day by day" },
];

export function AccuracyPage({
  meta,
  route,
  navigate,
}: {
  meta: MetaResponse;
  route: Route;
  navigate: (patch: Partial<Route>, options?: NavigateOptions) => void;
}) {
  const accuracy = useAccuracy(route.gate);
  const [scatterMode, setScatterMode] = useState<"raw" | "calibrated">("calibrated");

  const ready = accuracy.data && accuracy.data.gate.id === route.gate;
  if (accuracy.isError) {
    return (
      <ErrorPanel
        title="The accuracy record could not load"
        message={accuracy.error instanceof Error ? accuracy.error.message : "Unknown API error."}
        onRetry={() => void accuracy.refetch()}
      />
    );
  }
  if (!ready || !accuracy.data) {
    return <LoadingPage label="Scoring the month, hour by hour" />;
  }

  const data = accuracy.data;
  const { raw, calibrated } = data.summary;
  const improvement =
    raw.mae_mw && calibrated.mae_mw ? (1 - calibrated.mae_mw / raw.mae_mw) * 100 : null;
  const gate = meta.gates.find((item) => item.id === route.gate);
  const bestGate = [...data.gates].sort(
    (a, b) => (a.summary.mae_mw ?? 99999) - (b.summary.mae_mw ?? 99999),
  )[0];
  const coverage80 = data.coverage.two_sided.find((row) => row.id === "80");
  const coverage95 = data.coverage.two_sided.find((row) => row.id === "95");
  const oneSided = data.coverage.one_sided;
  const csvHref = exportUrl("accuracy", { gate: route.gate });

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-6 pt-7 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 rounded-[24px] border border-white/80 bg-white/50 px-4 py-4 backdrop-blur-md sm:px-5">
        <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
          <GateControl
            value={route.gate}
            gates={meta.gates}
            onChange={(value) => navigate({ gate: value }, { scroll: false })}
          />
          <div className="pb-1">
            <div className="label">Evaluation window</div>
            <div className="num mt-1.5 text-sm text-ink">1–31 January 2026</div>
            <div className="mt-0.5 font-mono text-[10px] text-ink-400">
              {data.summary.calibrated_days} calibrated days · {data.summary.provisional_days} provisional
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={csvHref} className="btn-ghost gap-1.5 text-xs" download>
            <Icon name="download" size={14} />
            Accuracy CSV
          </a>
          <a href="/api/docs" target="_blank" rel="noreferrer" className="btn-quiet gap-1.5 text-xs">
            <Icon name="api" size={14} />
            API
          </a>
        </div>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="chip chip-teal">Accuracy ledger</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
              {gate?.label} · {gate?.closure_label} gate
            </span>
          </div>
          <h1 className="display mt-5 max-w-3xl text-[clamp(2.6rem,5.2vw,4.6rem)] leading-[0.94]">
            Every gigawatt of error has a buyer.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-600">
            Elexon's national wind forecast over-called January by{" "}
            <span className="font-medium text-coral-600">{gw(raw.bias_mw)}</span> on average. One
            ratio correction removes most of that bias — but not the tail. This page reports both,
            and shows where the correction still fails.
          </p>
        </div>

        <div className="lg:col-span-5">
          <div className="card-ink p-6">
            <div className="label-light">Pooled accuracy · same hours, two treatments</div>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">Raw MAE</div>
                <div className="num mt-1 text-[2rem] leading-none text-paper">{formatNumber(raw.mae_mw ?? 0)}</div>
                <div className="mt-1 font-mono text-[9px] text-paper/35">n = {raw.n}</div>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-teal-300">
                <Icon name="arrow-right" size={16} />
              </span>
              <div className="text-right">
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-teal-300">Calibrated</div>
                <div className="num mt-1 text-[2rem] leading-none text-teal-300">
                  {formatNumber(calibrated.mae_mw ?? 0)}
                </div>
                <div className="mt-1 font-mono text-[9px] text-paper/35">n = {calibrated.n}</div>
              </div>
            </div>
            <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-paper/45">Bias</span>
                <span className="num text-paper/80">
                  {signedGw(raw.bias_mw)} <span className="text-paper/30">→</span>{" "}
                  <span className="text-teal-300">{signedGw(calibrated.bias_mw)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-paper/45">RMSE</span>
                <span className="num text-paper/80">
                  {gw(raw.rmse_mw)} <span className="text-paper/30">→</span>{" "}
                  <span className="text-teal-300">{gw(calibrated.rmse_mw)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-paper/45">MAE improvement</span>
                <span className="num text-teal-300">{pct(improvement, 0)}</span>
              </div>
            </div>
            <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-paper/30">
              One parameter · no ML · no look-ahead
            </p>
          </div>
        </div>
      </section>

      <Reveal className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Raw bias"
          value={signedGw(raw.bias_mw)}
          tone="coral"
          sub="forecast minus actual · 744 hours"
        />
        <StatCard
          label="Calibrated bias"
          value={signedGw(calibrated.bias_mw)}
          tone="teal"
          sub={`k = 0.861 · ${calibrated.n} calibrated hours`}
        />
        <StatCard
          label="Raw MAPE"
          value={pct(raw.mape_pct, 1)}
          sub={`P90 absolute error ${gw(raw.p90_abs_error_mw)}`}
        />
        <StatCard
          label="Over-forecast hours"
          value={pct(raw.overforecast_share_pct, 1)}
          sub={`${raw.overforecast_hours} of ${raw.n} hours ran hot`}
        />
      </Reveal>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() =>
              document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="chip transition-colors hover:border-teal-300 hover:bg-white/80 hover:text-teal-700"
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* error cloud + histogram */}
      <section id="error" className="mt-8 scroll-mt-24">
        <SectionHeading
          kicker="Where the error lives"
          title="The cloud moves left, not away"
          description="Each dot is one delivery hour. The diagonal is a perfect forecast. Calibration pulls the cloud onto the line; it cannot shrink the vertical spread, which is the part that costs money."
          action={
            <Segmented
              ariaLabel="Scatter series"
              value={scatterMode}
              onChange={setScatterMode}
              options={[
                { value: "raw", label: "Raw" },
                { value: "calibrated", label: "Calibrated" },
              ]}
            />
          }
        />
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <Reveal className="card p-4 sm:p-5 lg:col-span-7">
            <ScatterChart points={data.scatter} mode={scatterMode} />
            <div className="mt-2 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
              <span>{scatterMode === "raw" ? "Raw forecast" : "Calibrated forecast"} vs actual</span>
              <span>{formatNumber(data.scatter.length)} hours</span>
            </div>
          </Reveal>
          <Reveal delay={0.06} className="card flex flex-col p-5 sm:p-6 lg:col-span-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="label">Error distribution</div>
                <h3 className="display mt-1.5 text-2xl leading-none">Bias removed, tail kept</h3>
              </div>
              <InfoTip text="500 MW bins from −6.5 GW to +7.5 GW. Raw errors in grey, calibrated in teal/coral by sign. A calibrated point at zero is unbiased, not certain." />
            </div>
            <HistogramChart bins={data.histogram.bins} className="mt-4" />
            <div className="mt-auto grid grid-cols-2 gap-3 border-t border-ink-100 pt-4">
              <KpiInline
                label="Correlation"
                value={raw.correlation === null ? "—" : raw.correlation.toFixed(2)}
                hint="raw forecast vs actual"
              />
              <KpiInline
                label="P90 shortfall"
                value={gw(raw.p90_shortfall_mw)}
                hint="hours the forecast ran high"
                tone="coral"
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
              The calibrated distribution is centred near zero but fatter than a normal curve. The
              95% interval is not a guarantee — the next chart is.
            </p>
          </Reveal>
        </div>
      </section>

      {/* coverage */}
      <section id="coverage" className="mt-12 scroll-mt-24">
        <SectionHeading
          kicker="Coverage, measured"
          title="Claims are scored against outturn"
          description="A band is only useful if it is tested. Every band below is walk-forward: estimated from days before the delivery day, then checked against actual wind. No refitting on the answer."
          action={<span className="chip">n = {coverage80?.n ?? 0} calibrated hours</span>}
        />
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <Reveal className="card p-5 sm:p-6 lg:col-span-7">
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="label">Two-sided bands</span>
                  <InfoTip text="Central intervals: how often the realised calibrated residual sat inside the band." />
                </div>
                <div className="mt-3 space-y-3">
                  {data.coverage.two_sided.map((row) => (
                    <CoverageMeter
                      key={row.id}
                      label={`Central ${row.id}% band`}
                      claimed={row.claimed_pct}
                      empirical={row.empirical_pct}
                      detail={`avg width ${gw(row.average_width_mw)}`}
                    />
                  ))}
                </div>
              </div>
              <div className="hairline" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="label">Firm-wind coverage · one-sided</span>
                  <InfoTip text="How often actual wind was at least the firm level. This is the number that matters for cover sizing." />
                </div>
                <div className="mt-3 space-y-3">
                  {oneSided.map((row) => (
                    <CoverageMeter
                      key={row.id}
                      label={
                        row.id === "stress"
                          ? "Stress · worst residual"
                          : `${row.id}% firm wind (P${100 - Number(row.id)})`
                      }
                      claimed={row.claimed_pct}
                      empirical={row.empirical_pct}
                      detail={`${row.hits} of ${row.n} hours`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-6 border-t border-ink-100 pt-4 text-[11px] leading-relaxed text-ink-500">
              {data.coverage.note}
            </p>
          </Reveal>

          <Reveal delay={0.06} className="flex flex-col gap-4 lg:col-span-5">
            <div className="card p-5 sm:p-6">
              <div className="label">What this means for a buyer</div>
              <div className="mt-4 space-y-4">
                <Insight
                  value={`${pct(coverage80?.empirical_pct, 1)}`}
                  label="central 80% band realised"
                  body="The headline band is honest: 80.6% against a nominal 80%. Use it to frame the range, not to promise an outcome."
                  tone="teal"
                />
                <Insight
                  value={`${pct(coverage95?.empirical_pct, 1)}`}
                  label="central 95% band realised"
                  body="The tail is heavier than the label. The nominal 95% band is shown as context, never sold as a 95% guarantee."
                  tone="coral"
                />
                <Insight
                  value={`${pct(oneSided.find((row) => row.id === "90")?.empirical_pct, 1)}`}
                  label="actual wind ≥ 90% firm level"
                  body="Firm wind was cleared in 88.9% of calibrated hours. The desk still sizes cover, because the other 11.1% is the expensive part."
                  tone="ink"
                />
              </div>
            </div>
            <div className="rounded-2xl border border-sand-300 bg-sand-200/70 p-4">
              <div className="flex gap-2">
                <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-coral-500" />
                <p className="text-[11px] leading-relaxed text-ink-700">
                  <span className="font-medium">No 95% promise.</span> With 552 calibrated hours,
                  the extreme quantiles are estimated from few observations. The stress tier uses
                  the worst residual seen so far — explicitly a floor, not a bound.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* horizon + levels */}
      <section id="horizon" className="mt-12 scroll-mt-24">
        <SectionHeading
          kicker="Horizon & level"
          title="Skill decays with distance. Bias hides in the high wind."
          description="Lead time is measured from each forecast's publish time to the target hour. The same national forecast is also split by level: the error is not uniform across the wind fleet."
        />
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <Reveal className="card p-5 sm:p-6 lg:col-span-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="label">By lead time</div>
                <h3 className="display mt-1.5 text-2xl leading-none">Further out, further off</h3>
              </div>
              <div className="flex flex-col items-end gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-teal-600" /> MAE</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-coral-500" /> |bias|</span>
              </div>
            </div>
            <HorizonChart buckets={data.horizon.buckets} className="mt-4" />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-500">{data.horizon.note}</p>
          </Reveal>

          <Reveal delay={0.06} className="card p-5 sm:p-6 lg:col-span-6">
            <div className="label">By forecast level</div>
            <h3 className="display mt-1.5 text-2xl leading-none">The high-wind trap</h3>
            <div className="thin-scrollbar mt-4 overflow-x-auto">
              <table className="data-table min-w-[520px]">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th className="text-right">Hours</th>
                    <th className="text-right">Raw bias</th>
                    <th className="text-right">Raw MAE</th>
                    <th className="text-right">Cal. MAE</th>
                    <th className="text-right">Ran hot</th>
                  </tr>
                </thead>
                <tbody>
                  {data.levels.map((row) => (
                    <tr key={row.label}>
                      <td className="num text-ink">{row.label}</td>
                      <td className="num text-right text-ink-500">{row.n}</td>
                      <td className="num text-right text-coral-600">{signedGw(row.bias_mw)}</td>
                      <td className="num text-right text-ink">{gw(row.mae_mw)}</td>
                      <td className="num text-right text-teal-700">{gw(row.calibrated_mae_mw)}</td>
                      <td className="num text-right text-ink-500">{pct(row.overforecast_share_pct, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
              Above 20 GW the raw forecast was high by {signedGw(data.levels[data.levels.length - 1]?.bias_mw)} on
              average. Calibration reduces the level bias, but the residual spread is widest exactly
              when the fleet is largest.
            </p>
          </Reveal>
        </div>
      </section>

      {/* gates */}
      <section id="gates" className="mt-12 scroll-mt-24">
        <SectionHeading
          kicker="Gate comparison"
          title="Later information is better information"
          description="The same month, three market gates, three snapshot vintages. The half-hourly gate sees a 11:30 snapshot and posts the lowest raw MAE — but it also carries four extra hours of information. The comparison is descriptive, not a like-for-like ranking."
        />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {data.gates.map((row, index) => {
            const maxMae = Math.max(...data.gates.map((item) => item.summary.mae_mw ?? 0));
            const width = ((row.summary.mae_mw ?? 0) / maxMae) * 100;
            const active = row.id === route.gate;
            return (
              <Reveal delay={index * 0.04} key={row.id} className={cn("card p-5", active && "ring-1 ring-teal-300")}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="label">{row.market}</div>
                    <h3 className="mt-1 text-sm font-medium text-ink">{row.short_label}</h3>
                  </div>
                  {active ? <span className="chip chip-teal">Viewing</span> : null}
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="num text-2xl text-ink">{formatNumber(row.summary.mae_mw ?? 0)}</span>
                  <span className="font-mono text-[10px] text-ink-400">MW MAE</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={cn("h-full rounded-full", active ? "bg-teal-500" : "bg-ink-300")}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3">
                  <div>
                    <div className="label">Bias</div>
                    <div className="num mt-1 text-xs text-coral-600">{signedGw(row.summary.bias_mw)}</div>
                  </div>
                  <div>
                    <div className="label">Snapshot lead</div>
                    <div className="num mt-1 text-xs text-ink">
                      {Math.floor(row.snapshot_lead_minutes / 60)}h {row.snapshot_lead_minutes % 60}m
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate({ gate: row.id }, { scroll: false })}
                  className="link-quiet mt-4 text-xs"
                >
                  {active ? "Showing this gate" : "Switch to this gate"}
                  <Icon name="arrow-right" size={13} />
                </button>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
          Lowest raw MAE: <span className="font-medium text-ink">{bestGate?.short_label}</span> at{" "}
          {gw(bestGate?.summary.mae_mw)}. The desk defaults to N2EX because it is the earliest
          standard GB day-ahead gate, not because it flatters the model.
        </p>
      </section>

      {/* heatmap + worst */}
      <section id="daily" className="mt-12 scroll-mt-24">
        <SectionHeading
          kicker="Day by day"
          title="The tail has a date"
          description="One cell per delivery hour. Coral means the forecast ran above actual wind — the under-procurement direction. The 28 January column is the reason the desk carries a stress tier."
          action={
            <a href={csvHref} className="btn-ghost gap-1.5 text-xs" download>
              <Icon name="download" size={13} />
              Download the ledger
            </a>
          }
        />
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <Reveal className="card p-5 sm:p-6 lg:col-span-8">
            <ErrorHeatmap cells={data.heatmap} />
          </Reveal>
          <Reveal delay={0.06} className="card p-5 sm:p-6 lg:col-span-4">
            <div className="flex items-center justify-between">
              <div className="label">Worst raw hours</div>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
                forecast − actual
              </span>
            </div>
            <div className="mt-3 divide-y divide-ink-100">
              {data.worst.slice(0, 6).map((row) => (
                <button
                  key={`${row.date}-${row.hour}`}
                  type="button"
                  onClick={() => navigate({ view: "desk", date: row.date })}
                  className="group flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-white/50"
                >
                  <div>
                    <div className="font-mono text-[11px] text-ink">
                      {dateShort(row.date)} · {hourLabel(row.hour)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-400">
                      fc {gw(row.forecast_mw)} · act {gw(row.actual_mw)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="num text-xs text-coral-600">{signedGw(row.error_mw)}</span>
                    <Icon
                      name="arrow-right"
                      size={12}
                      className="text-ink-300 transition-colors group-hover:text-teal-600"
                    />
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-4 border-t border-ink-100 pt-3 text-[11px] leading-relaxed text-ink-500">
              Click a row to replay that delivery day in the desk. The largest miss of the month was{" "}
              {gw(data.worst[0]?.error_mw)} raw, at {dateShort(data.worst[0]?.date ?? "")}{" "}
              {hourLabel(data.worst[0]?.hour ?? 0)}.
            </p>
          </Reveal>
        </div>

        <Reveal className="card mt-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="label">Daily ledger</div>
              <h3 className="display mt-1.5 text-2xl leading-none">Thirty-one verdicts</h3>
            </div>
            <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sand-500" /> provisional</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> calibrated</span>
            </div>
          </div>
          <div className="thin-scrollbar mt-4 max-h-[420px] overflow-auto rounded-2xl border border-ink-100/80">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="text-right">k</th>
                  <th className="text-right">Raw bias</th>
                  <th className="text-right">Raw MAE</th>
                  <th className="text-right">Cal. MAE</th>
                  <th className="text-right">Band 80</th>
                  <th className="text-right">Firm 90</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((row) => (
                  <tr key={row.date}>
                    <td>
                      <button
                        type="button"
                        onClick={() => navigate({ view: "desk", date: row.date })}
                        className="font-mono text-[11px] text-ink-700 underline-offset-4 hover:text-teal-700 hover:underline"
                      >
                        {dateShort(row.date)}
                      </button>
                    </td>
                    <td>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em]",
                          row.status === "calibrated" ? "text-teal-700" : "text-ink-400",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            row.status === "calibrated" ? "bg-teal-500" : "bg-sand-500",
                          )}
                        />
                        {row.status}
                      </span>
                    </td>
                    <td className="num text-right text-ink-500">{row.k === null ? "—" : row.k.toFixed(3)}</td>
                    <td className="num text-right text-coral-600">{signedGw(row.raw.bias_mw)}</td>
                    <td className="num text-right text-ink">{gw(row.raw.mae_mw)}</td>
                    <td className="num text-right text-teal-700">{gw(row.calibrated?.mae_mw ?? null)}</td>
                    <td className="num text-right text-ink-500">
                      {row.band80_hits === null ? "—" : `${row.band80_hits}/${row.band80_n}`}
                    </td>
                    <td className="num text-right text-ink-500">
                      {row.firm90_hits === null ? "—" : `${row.firm90_hits}/24`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      <Reveal className="mt-8 grid gap-4 rounded-3xl border border-ink-100 bg-white/50 p-5 sm:grid-cols-3 sm:p-6">
        <KpiInline
          label="Forecast revisions"
          value={data.revisions.overall ? mw(data.revisions.overall.mean_abs_mw) : "—"}
          hint={`mean abs · P90 ${mw(data.revisions.overall?.p90_abs_mw)}`}
        />
        <KpiInline
          label="Largest revision"
          value={mw(data.revisions.overall?.max_abs_mw)}
          hint={`${formatNumber(data.revisions.overall?.n ?? 0)} comparable changes`}
        />
        <div className="text-[11px] leading-relaxed text-ink-500">
          {data.method_notes.map((note) => (
            <p key={note} className="mt-1 first:mt-0">
              {note}
            </p>
          ))}
        </div>
      </Reveal>
    </main>
  );
}

function Insight({
  value,
  label,
  body,
  tone,
}: {
  value: string;
  label: string;
  body: string;
  tone: "teal" | "coral" | "ink";
}) {
  return (
    <div className="flex gap-4">
      <div
        className={cn(
          "num w-16 shrink-0 text-xl",
          tone === "teal" ? "text-teal-700" : tone === "coral" ? "text-coral-600" : "text-ink",
        )}
      >
        {value}
      </div>
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400">{label}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-600">{body}</p>
      </div>
    </div>
  );
}

function CoverageMeter({
  label,
  claimed,
  empirical,
  detail,
}: {
  label: string;
  claimed: number | null;
  empirical: number | null;
  detail: string;
}) {
  const realised = empirical ?? 0;
  const underperforms = claimed !== null && empirical !== null && empirical + 2 < claimed;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className={cn("num text-sm", underperforms ? "text-coral-600" : "text-teal-700")}>
            {pct(empirical, 1)}
          </span>
          <span className="font-mono text-[9px] text-ink-400">
            {claimed === null ? "no claim" : `vs ${pct(claimed, 0)} nominal`}
          </span>
        </span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            underperforms ? "bg-coral-400" : "bg-teal-500",
          )}
          style={{ width: `${Math.min(100, realised)}%` }}
        />
        {claimed !== null ? (
          <span
            className="absolute inset-y-0 w-px bg-ink/60"
            style={{ left: `${claimed}%` }}
            title={`Nominal ${claimed}%`}
          />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-400">
        <span>{detail}</span>
        <span>0–100%</span>
      </div>
    </div>
  );
}
