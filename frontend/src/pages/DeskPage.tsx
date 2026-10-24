import { useMemo, useState } from "react";
import type { MetaResponse } from "../types";
import type { NavigateOptions, Route } from "../lib/route";
import { COVER_TIERS, coverForHour, summariseCover, type CoverTierId } from "../lib/cover";
import {
  cn,
  dateLong,
  formatNumber,
  gwh,
  gw,
  hourLabel,
  mw,
  pct,
  signedGw,
  timestampLabel,
  weekday,
} from "../lib/format";
import { exportUrl } from "../api";
import { useDesk } from "../hooks";
import {
  DateControl,
  Divider,
  ErrorPanel,
  GateControl,
  Icon,
  InfoTip,
  KpiInline,
  LoadingPage,
  Sparkline,
  StatCard,
  StatusChip,
  Switch,
} from "../components/ui";
import { Windscape } from "../components/Windscape";
import { BandChart } from "../components/charts/BandChart";
import { DispatchFlowCanvas } from "../components/charts/DispatchFlowCanvas";
import { CopilotPanel } from "../components/CopilotPanel";
import { Reveal } from "../components/Reveal";
import type { HourRow } from "../types";

export function DeskPage({
  meta,
  route,
  navigate,
}: {
  meta: MetaResponse;
  route: Route;
  navigate: (patch: Partial<Route>, options?: NavigateOptions) => void;
}) {
  const desk = useDesk(route.date, route.gate);
  const tail = useDesk("2026-01-28", route.gate);
  const [tier, setTier] = useState<CoverTierId>("p90");
  const [focusHour, setFocusHour] = useState<number | null>(null);
  const [showActual, setShowActual] = useState(true);

  const ready =
    desk.data &&
    desk.data.delivery_date === route.date &&
    desk.data.gate.id === route.gate;

  const coverSummary = useMemo(() => {
    if (!desk.data || !ready) return null;
    return summariseCover(desk.data.hourly, route.share, tier);
  }, [desk.data, ready, route.share, tier]);

  if (desk.isError) {
    return (
      <ErrorPanel
        message={
          desk.error instanceof Error
            ? desk.error.message
            : "The API did not return a brief for this date."
        }
        onRetry={() => void desk.refetch()}
      />
    );
  }
  if (!ready || !desk.data) {
    return <LoadingPage label="Reading the pre-gate snapshot" />;
  }

  const data = desk.data;
  const provisional = data.status === "provisional";
  const forecastGw = data.national.forecast_average_mw / 1000;
  const calibratedGw = data.national.calibrated_average_mw
    ? data.national.calibrated_average_mw / 1000
    : null;
  const firmGw = data.national.firm_90_average_mw
    ? data.national.firm_90_average_mw / 1000
    : null;
  const peak = data.hourly.reduce<HourRow | null>(
    (best, row) =>
      row.forecast_mw !== null && (!best || (best.forecast_mw ?? 0) < row.forecast_mw)
        ? row
        : best,
    null,
  );
  const reliability = data.reliability.levels[tier];
  const coverTierMeta = COVER_TIERS.find((item) => item.id === tier) ?? COVER_TIERS[1];
  const coverPeakHour = coverSummary?.peakHour ?? 0;
  const tailData = tail.data && tail.data.delivery_date === "2026-01-28" ? tail.data : null;
  const tailBias = tailData?.outturn.raw?.bias_mw ?? null;
  const tailHits = tailData?.outturn.hours_in_band_80 ?? null;
  const tailCalMae = tailData?.outturn.calibrated?.mae_mw ?? null;
  const tailStress = tailData?.cover.confidence.stress?.peak_mw ?? null;
  const tailFirm = tailData?.cover.confidence.p90?.peak_mw ?? null;

  const csvHref = exportUrl("hourly", {
    date: route.date,
    gate: route.gate,
    share: route.share,
  });

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-6 pt-7 sm:px-8 lg:px-10">
      {/* control strip */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 rounded-[24px] border border-white/80 bg-white/50 px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-md sm:px-5">
        <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
          <DateControl
            value={route.date}
            dates={meta.dates}
            onChange={(date) => navigate({ date, view: "desk" }, { scroll: false })}
          />
          <GateControl
            value={route.gate}
            gates={meta.gates}
            onChange={(gate) => navigate({ gate }, { scroll: false })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip status={data.status} label={data.status_label} />
          <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500 sm:flex">
            <Icon name="clock" size={12} />
            {timestampLabel(data.gate.snapshot_time)}
          </div>
          <a href={csvHref} className="btn-ghost gap-1.5 text-xs" download>
            <Icon name="download" size={14} />
            CSV
          </a>
        </div>
      </div>

      {/* hero */}
      <section className="mt-5 grid gap-5 lg:grid-cols-12">
        <Reveal className="flex flex-col justify-between lg:col-span-5">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="chip chip-teal">{data.gate.short_label}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
                {weekday(data.delivery_date)} · {dateLong(data.delivery_date)}
              </span>
            </div>
            <h1 className="display mt-5 text-[clamp(2.5rem,4.4vw,4rem)] leading-[0.94]">
              The forecast says
              <span className="block text-teal-700">{formatNumber(forecastGw, 1)} GW.</span>
              {provisional ? (
                <span className="block italic text-ink-700">Read it raw — for now.</span>
              ) : (
                <span className="block italic text-ink-700">
                  Plan on {formatNumber(firmGw ?? 0, 1)} GW.
                </span>
              )}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-600">
              {provisional ? (
                <>
                  Seven complete delivery days are needed before Windwise will publish a calibrated
                  number. Until {dateLong("2026-01-09")} the desk shows the raw Elexon forecast and
                  no confidence band — deliberately.
                </>
              ) : (
                <>
                  Calibration puts expected national wind at{" "}
                  <span className="font-medium text-ink">{formatNumber(calibratedGw ?? 0, 1)} GW</span>
                  . The 90% firm level is {formatNumber(firmGw ?? 0, 1)} GW, so at a{" "}
                  {pct(route.share, route.share % 1 === 0 ? 0 : 1)} share, hold{" "}
                  <span className="font-medium text-coral-600">{mw(coverSummary?.peakMw)}</span> of
                  thermal cover at peak.
                </>
              )}
            </p>
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-primary gap-2"
                onClick={() =>
                  document.getElementById("cover")?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              >
                Size the cover
                <Icon name="arrow-right" size={15} />
              </button>
              <button
                type="button"
                className="btn-ghost gap-2"
                onClick={() => navigate({ view: "method" })}
              >
                How it works
              </button>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-ink-200/60 pt-4">
              <div>
                <div className="label">Snapshot used</div>
                <div className="num mt-1 text-sm text-ink">{timestampLabel(data.gate.snapshot_time)}</div>
                <div className="mt-0.5 font-mono text-[10px] text-ink-400">
                  {data.gate.minutes_before_gate} min before gate
                </div>
              </div>
              <div>
                <div className="label">History window</div>
                <div className="num mt-1 text-sm text-ink">
                  {provisional ? "—" : `${data.calibration.days_used} days`}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-ink-400">
                  {provisional ? "unlocks 9 Jan" : `k = ${data.calibration.k?.toFixed(3)}`}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="card overflow-hidden lg:col-span-7">
          <Windscape
            hourly={data.hourly}
            tier={tier}
            onSelect={(hour) => setFocusHour(hour)}
            className="h-full min-h-[360px]"
          />
        </Reveal>
      </section>

      {/* KPI strip */}
      <Reveal delay={0.05} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="National wind · forecast"
          value={formatNumber(forecastGw, 1)}
          unit="GW"
          sub={
            peak ? `Peak ${gw(peak.forecast_mw, 1)} at ${hourLabel(peak.hour)} · raw Elexon WINDFOR` : undefined
          }
          spark={<Sparkline values={data.hourly.map((row) => row.forecast_mw)} color="#7E9894" />}
        />
        <StatCard
          label="Calibrated expectation"
          value={calibratedGw === null ? "—" : formatNumber(calibratedGw, 1)}
          unit={calibratedGw === null ? undefined : "GW"}
          delta={
            data.national.calibration_delta_mw === null
              ? undefined
              : signedGw(data.national.calibration_delta_mw, 1)
          }
          sub={
            calibratedGw === null
              ? "Requires 7 complete delivery days"
              : `k = ${data.calibration.k?.toFixed(3)} · ${data.calibration.days_used} days, ≤ D−2`
          }
          spark={<Sparkline values={data.hourly.map((row) => row.calibrated_mw)} color="#0E7C6B" />}
        />
        <StatCard
          label="Firm wind · 90% tier"
          value={firmGw === null ? "—" : formatNumber(firmGw, 1)}
          unit={firmGw === null ? undefined : "GW"}
          sub={
            firmGw === null
              ? "Provisional brief · no firm level"
              : `One-sided band · avg width ${gw(data.national.band80_average_width_mw)}`
          }
        />
        <StatCard
          label={`Thermal cover · ${coverTierMeta.shortLabel}`}
          value={coverSummary ? formatNumber(coverSummary.mwh / 1000, 1) : "—"}
          unit={coverSummary ? "GWh" : undefined}
          sub={
            coverSummary
              ? `Peak ${mw(coverSummary.peakMw)} at ${hourLabel(coverSummary.peakHour)} · ${pct(route.share, 0)} share`
              : "Calibration unlocks 9 January"
          }
          spark={
            <Sparkline
              values={data.hourly.map((row) => (provisional ? null : coverForHour(row, route.share, tier)))}
              color="#F0705F"
            />
          }
        />
      </Reveal>

      {/* chart + calculator */}
      <section className="mt-5 grid gap-5 lg:grid-cols-12">
        <Reveal className="card p-5 sm:p-6 lg:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label">The day, hour by hour</div>
              <h2 className="display mt-1.5 text-[clamp(1.7rem,2.6vw,2.3rem)] leading-tight">
                {provisional ? "Raw forecast and outturn" : "What is forecast, what is firm"}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Switch
                checked={showActual}
                onChange={setShowActual}
                label="Outturn"
                description="Actuals are hindsight"
                tone="teal"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] text-ink-500">
            <Legend color="#0E7C6B" label="Calibrated" />
            <Legend color="#7E9894" label="Raw forecast" dashed />
            <Legend color="#45B6A2" label="80% band" swatch />
            <Legend color="#5FC4E6" label="95% band" swatch />
            <Legend color="#B08A3E" label={`Firm ${tier === "stress" ? "stress" : "90%"}`} dashed />
            {showActual ? <Legend color="#F0705F" label="Actual" /> : null}
          </div>

          <BandChart
            hourly={data.hourly}
            tier={tier}
            selectedHour={focusHour}
            onSelect={setFocusHour}
            showActual={showActual}
            className="mt-4"
          />

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4 sm:grid-cols-4">
            <KpiInline
              label="Forecast peak"
              value={gw(peak?.forecast_mw)}
              hint={peak ? `at ${hourLabel(peak.hour)} UTC` : undefined}
            />
            <KpiInline
              label="Band 80 width"
              value={gw(data.national.band80_average_width_mw)}
              hint="average across 24 hours"
            />
            <KpiInline
              label="Snapshot revision"
              value={data.revision ? mw(data.revision.mean_abs_change_mw) : "—"}
              hint={data.revision ? `mean abs vs ${timestampLabel(data.revision.previous_snapshot)}` : "no earlier snapshot"}
            />
            <KpiInline
              label={`Firm ${tier === "p80" ? "80" : tier === "p90" ? "90" : "stress"} coverage`}
              value={reliability.empirical_pct === null ? "—" : pct(reliability.empirical_pct, 1)}
              hint={`${reliability.hits} of ${data.reliability.n} calibrated hours`}
              tone="teal"
            />
          </div>
        </Reveal>

        <Reveal delay={0.06} id="cover" className="card flex flex-col p-5 sm:p-6 lg:col-span-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="label">Cover calculator</div>
              <h2 className="display mt-1.5 text-3xl leading-none">Hold how much?</h2>
            </div>
            <InfoTip text="Cover = your share × max(0, national forecast − firm wind). MWh is the sum of hourly MW, capped at zero. It is a thermal-capacity proxy, not a traded position." />
          </div>

          <div className="mt-5 space-y-2" role="radiogroup" aria-label="Cover confidence tier">
            {COVER_TIERS.map((item) => {
              const summary = summariseCover(data.hourly, route.share, item.id);
              const active = item.id === tier;
              const realised = data.reliability.levels[item.id].empirical_pct;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTier(item.id)}
                  className={cn(
                    "w-full rounded-2xl border px-3.5 py-3 text-left transition-all duration-200",
                    active
                      ? "border-teal-300 bg-teal-100/60 shadow-[0_10px_26px_-22px_rgba(14,42,43,0.7)]"
                      : "border-ink-100 bg-white/40 hover:border-ink-200 hover:bg-white/70",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-ink">{item.label}</span>
                    <span className="num text-sm text-ink">
                      {summary ? gwh(summary.mwh) : "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span className="text-[11px] leading-snug text-ink-500">{item.description}</span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-400">
                      {realised === null ? "—" : `${pct(realised, 1)} realised`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <div className="label">Your share of national wind</div>
              <div className="num text-sm text-ink">{pct(route.share, route.share % 1 === 0 ? 0 : 1)}</div>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={route.share}
              aria-label="Client share of national wind, percent"
              onChange={(event) =>
                navigate({ share: Number(event.target.value) }, { replace: true, scroll: false })
              }
              className="slider mt-3"
            />
            <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400">
              <span>1%</span>
              <span>
                planned wind {gw((data.national.forecast_average_mw * route.share) / 100)}
              </span>
              <span>50%</span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-ink px-4 py-4 text-paper">
            <div className="label-light">{coverTierMeta.label} · capacity to hold</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="num text-[2.4rem] leading-none tracking-[-0.04em] text-paper">
                {coverSummary ? formatNumber(coverSummary.mwh / 1000, 1) : "—"}
              </span>
              <span className="font-mono text-xs text-paper/50">GWh</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-paper/40">Peak</div>
                <div className="num mt-0.5 text-xs text-paper">{mw(coverSummary?.peakMw)}</div>
              </div>
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-paper/40">At</div>
                <div className="num mt-0.5 text-xs text-paper">{hourLabel(coverPeakHour)}</div>
              </div>
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-paper/40">Hours</div>
                <div className="num mt-0.5 text-xs text-paper">{coverSummary?.hoursPositive ?? 0}/24</div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
            {data.cover.definition} At the {pct(route.share, 0)} share, the raw forecast implies{" "}
            {gw((data.national.forecast_average_mw * route.share) / 100)} of wind on average.
          </p>
        </Reveal>
      </section>

      {/* hourly table */}
      <Reveal className="mt-5 card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label">Hourly book</div>
            <h2 className="display mt-1.5 text-2xl leading-none">Every hour, every number</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
              Click an hour to mark it on the chart
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400 sm:hidden">
              Swipe table for all columns
            </span>
            <a href={csvHref} className="btn-quiet gap-1.5 text-xs" download>
              <Icon name="download" size={13} />
              Download
            </a>
          </div>
        </div>

        <div className="thin-scrollbar mt-4 max-h-[640px] overflow-auto rounded-2xl border border-ink-100/80">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hour</th>
                <th className="text-right">Forecast</th>
                <th className="text-right">Calibrated</th>
                <th className="text-right">80% band</th>
                <th className="text-right">95% band</th>
                <th className="text-right">Firm {tier === "p80" ? "80" : tier === "p90" ? "90" : "stress"}</th>
                <th className="text-right">Cover</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Error</th>
              </tr>
            </thead>
            <tbody>
              {data.hourly.map((row) => {
                const focused = focusHour === row.hour;
                return (
                  <tr
                    key={row.hour}
                    className={cn(focused && "bg-teal-100/50")}
                  >
                    <td>
                      <button
                        type="button"
                        onClick={() => setFocusHour(focused ? null : row.hour)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full px-2 py-1 font-mono text-[11px] transition-colors",
                          focused ? "bg-teal-600 text-white" : "text-ink-700 hover:bg-ink-100",
                        )}
                      >
                        {focused ? <Icon name="check" size={11} /> : null}
                        {row.label}
                      </button>
                    </td>
                    <td className="num text-right text-ink-600">{mw(row.forecast_mw)}</td>
                    <td className="num text-right text-ink">{mw(row.calibrated_mw)}</td>
                    <td className="num text-right text-ink-500">
                      {row.band80_low_mw === null || row.band80_high_mw === null
                        ? "—"
                        : `${formatNumber(row.band80_low_mw)} – ${formatNumber(row.band80_high_mw)}`}
                    </td>
                    <td className="num text-right text-ink-400">
                      {row.band95_low_mw === null || row.band95_high_mw === null
                        ? "—"
                        : `${formatNumber(row.band95_low_mw)} – ${formatNumber(row.band95_high_mw)}`}
                    </td>
                    <td className="num text-right text-ink-600">{mw(row.firm_mw[tier])}</td>
                    <td className="num text-right text-coral-600">{mw(row.cover_mw[tier])}</td>
                    <td className="num text-right text-ink">{mw(row.actual_mw)}</td>
                    <td
                      className={cn(
                        "num text-right",
                        (row.error_mw ?? 0) > 0 ? "text-coral-600" : "text-teal-700",
                      )}
                    >
                      {signedGw(row.error_mw)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Reveal>

      {/* Next-Gen Power Systems Grid Dispatch & AI Copilot Suite */}
      <section className="mt-8 space-y-6">
        <Reveal>
          <DispatchFlowCanvas
            windMw={Math.round(data.national.forecast_average_mw * (route.share / 100))}
            peakerMw={Math.round(coverSummary?.peakMw ?? 451)}
            demandMw={Math.round(data.national.forecast_average_mw * (route.share / 100) * 0.95)}
          />
        </Reveal>

        <Reveal>
          <CopilotPanel
            dateText={data.delivery_date}
            gate={data.gate.id}
            sharePct={route.share}
            forecastMw={data.national.forecast_average_mw}
            firmMw={data.national.firm_90_average_mw ?? 8326.0}
          />
        </Reveal>
      </section>

      {/* outturn + decision point */}
      <section className="mt-5 grid gap-5 lg:grid-cols-12">
        <Reveal className="card-ink flex flex-col justify-between p-5 sm:p-6 lg:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="label-light">Hindsight · not used in the decision</div>
              <h2 className="display mt-1.5 text-[clamp(1.8rem,2.8vw,2.4rem)] leading-tight text-paper">
                {data.outturn.available
                  ? `How ${dateLong(data.delivery_date)} landed`
                  : "Outturn not available"}
              </h2>
            </div>
            {data.outturn.available && data.calibration.available ? (
              <div className="text-right">
                <div className="num text-3xl leading-none text-teal-300">
                  {data.outturn.hours_in_band_80}
                  <span className="text-paper/30">/24</span>
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">
                  hours in 80% band
                </div>
              </div>
            ) : null}
          </div>

          {data.outturn.available ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <DarkKpi
                  label="Raw MAE"
                  value={mw(data.outturn.raw?.mae_mw)}
                  hint={`bias ${signedGw(data.outturn.raw?.bias_mw)}`}
                />
                <DarkKpi
                  label="Calibrated MAE"
                  value={mw(data.outturn.calibrated?.mae_mw)}
                  hint={
                    data.outturn.calibrated && data.outturn.raw?.mae_mw
                      ? `${pct(
                          (1 -
                            (data.outturn.calibrated.mae_mw ?? 0) /
                              (data.outturn.raw.mae_mw || 1)) *
                            100,
                          0,
                        )} lower`
                      : "provisional"
                  }
                  tone="teal"
                />
                <DarkKpi
                  label="Firm 90 cleared"
                  value={
                    data.outturn.hours_above_firm_90 === undefined
                      ? "—"
                      : `${data.outturn.hours_above_firm_90}/24`
                  }
                  hint="actual ≥ firm level"
                />
                <DarkKpi
                  label="Worst hour"
                  value={hourLabel(data.outturn.worst_hour ?? 0)}
                  hint={signedGw(data.outturn.worst_error_mw)}
                  tone="coral"
                />
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">
                  <span>Forecast error by hour · raw vs calibrated</span>
                  <span className="hidden gap-3 sm:flex">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-coral-300" /> raw
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-300" /> calibrated
                    </span>
                  </span>
                </div>
                <ErrorStrip rows={data.hourly} />
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-paper/60">{data.outturn.reason}</p>
          )}
        </Reveal>

        <Reveal delay={0.06} className="card flex flex-col p-5 sm:p-6 lg:col-span-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="label">Point in time</div>
              <h2 className="display mt-1.5 text-2xl leading-none">The decision point</h2>
            </div>
            <InfoTip text="The selected snapshot is the latest WINDFOR vintage with full 24-hour coverage published strictly before gate closure. Nothing after the gate is used." />
          </div>

          <div className="mt-7">
            <div className="relative flex items-start justify-between">
              <div className="absolute left-1 right-1 top-[7px] h-px bg-ink-200" />
              <TimelineNode
                label="Previous"
                value={data.revision ? timestampLabel(data.revision.previous_snapshot) : "—"}
                tone="muted"
              />
              <TimelineNode
                label="Used"
                value={timestampLabel(data.gate.snapshot_time)}
                tone="active"
              />
              <TimelineNode
                label="Gate closes"
                value={`${data.gate.closure_label} UTC`}
                tone="gate"
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <KpiInline
              label="Mean abs revision"
              value={data.revision ? mw(data.revision.mean_abs_change_mw) : "—"}
              hint="vs previous full snapshot"
            />
            <KpiInline
              label="Largest revision"
              value={data.revision ? mw(data.revision.max_abs_change_mw) : "—"}
              hint={data.revision ? `${data.revision.hours_changed_over_500mw}/24 hours > 500 MW` : undefined}
            />
          </div>

          <Divider className="my-5" />

          <div className="space-y-3 text-xs leading-relaxed text-ink-600">
            <div className="flex items-start gap-2">
              <Icon
                name={data.data_quality.expected_snapshot_missing ? "alert" : "check"}
                size={14}
                className={cn(
                  "mt-0.5 shrink-0",
                  data.data_quality.expected_snapshot_missing ? "text-coral-500" : "text-teal-600",
                )}
              />
              <p>
                {data.data_quality.note ??
                  `Scheduled ${data.gate.id === "epex_hh" ? "11:30" : data.gate.id === "epex" ? "07:30" : "09:30"} snapshot available with full 24-hour coverage.`}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-teal-600" />
              <p>
                Calibration for this day uses actuals up to{" "}
                <span className="font-mono text-[11px] text-ink">
                  {data.calibration.history_to ?? "—"}
                </span>
                , never D−1.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              navigate({ view: "snapshots", date: data.delivery_date }, { scroll: false })
            }
            className="link-quiet mt-5"
          >
            Trace every snapshot for this day
            <Icon name="arrow-right" size={14} />
          </button>
        </Reveal>
      </section>

      {/* tail case */}
      {tailData ? (
        <Reveal className="mt-5 overflow-hidden rounded-[28px] border border-ink-800 bg-ink text-paper">
          <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-6 -top-10 select-none font-display text-[14rem] leading-none text-teal-300/10"
            >
              28
            </div>
            <div className="relative lg:col-span-7">
              <div className="label-light">Tail case · 28 January 2026</div>
              <h2 className="display mt-3 max-w-xl text-[clamp(2rem,3.4vw,3rem)] leading-[1.02]">
                One day the forecast missed by five gigawatts. The desk showed it.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/65">
                A forecast that is usually 1.8 GW hot can be 5.4 GW hot on the day it matters.
                On 28 January the 80% band held for only {tailHits ?? "—"} of 24 hours, and even the
                calibrated forecast missed by {gw(tailCalMae)}. That is why coverage is measured,
                not promised.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate({ view: "desk", date: "2026-01-28" })}
                  className="btn bg-paper text-ink hover:bg-white"
                >
                  Open 28 January
                  <Icon name="arrow-right" size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ view: "accuracy" })}
                  className="btn border border-white/20 text-paper/80 hover:border-teal-300/60 hover:text-paper"
                >
                  See the error record
                </button>
              </div>
            </div>
            <div className="relative grid grid-cols-2 gap-x-6 gap-y-5 self-center lg:col-span-5">
              <DarkKpi label="Raw bias" value={signedGw(tailBias)} hint="over-forecast" tone="coral" />
              <DarkKpi label="80% band hits" value={tailHits === null ? "—" : `${tailHits}/24`} hint="calibrated" />
              <DarkKpi
                label="Cover · 90%"
                value={mw(tailFirm)}
                hint="peak at 10% share"
                tone="teal"
              />
              <DarkKpi label="Cover · stress" value={mw(tailStress)} hint="worst residual" tone="coral" />
            </div>
          </div>
        </Reveal>
      ) : null}

      <Reveal className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-white/45 px-4 py-3">
        <p className="text-xs text-ink-500">
          Every number on this page comes from the committed Elexon snapshot. The dataset checksum
          is verified at boot.
        </p>
        <div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
          <span>{formatNumber(data.hourly.length)} hours</span>
          <span>{formatNumber(meta.dataset.counts.forecast_snapshots)} snapshots</span>
          <span className="hidden sm:inline">sha {meta.dataset.sha256.slice(0, 10)}…</span>
        </div>
      </Reveal>

      {!showActual ? (
        <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-ink-300">
          Outturn hidden in the chart · table still shows actuals
        </p>
      ) : null}
    </main>
  );
}

function Legend({
  color,
  label,
  dashed,
  swatch,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  swatch?: boolean;
}) {
  if (swatch) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-[3px]" style={{ backgroundColor: color, opacity: 0.45 }} />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-0.5 w-5 rounded-full"
        style={{
          backgroundImage: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)`
            : undefined,
          backgroundColor: dashed ? undefined : color,
        }}
      />
      {label}
    </span>
  );
}

function TimelineNode({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "muted" | "active" | "gate";
}) {
  return (
    <div className="relative z-10 flex w-1/3 flex-col items-start first:items-start last:items-end">
      <span
        className={cn(
          "h-3.5 w-3.5 rounded-full border-2 bg-paper",
          tone === "active"
            ? "border-teal-600 bg-teal-500"
            : tone === "gate"
              ? "border-coral-500 bg-coral-100"
              : "border-ink-300",
        )}
      />
      <div className={cn("mt-2 font-mono text-[9px] uppercase tracking-[0.12em]", tone === "active" ? "text-teal-700" : "text-ink-400")}>
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-ink-600">{value}</div>
    </div>
  );
}

function DarkKpi({
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
    <div className="border-t border-white/15 pt-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">{label}</div>
      <div
        className={cn(
          "num mt-1 text-lg leading-tight",
          tone === "teal" ? "text-teal-300" : tone === "coral" ? "text-coral-300" : "text-paper",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[10px] text-paper/40">{hint}</div> : null}
    </div>
  );
}

function ErrorStrip({ rows }: { rows: HourRow[] }) {
  const maxAbs = Math.max(
    500,
    ...rows.flatMap((row) => [Math.abs(row.error_mw ?? 0), Math.abs(row.calibrated_error_mw ?? 0)]),
  );
  return (
    <div>
      <div className="relative mt-2 h-24">
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
        <div className="absolute inset-0 flex items-stretch gap-[3px]">
          {rows.map((row) => {
            const rawHeight = Math.min(48, (Math.abs(row.error_mw ?? 0) / maxAbs) * 48);
            const calibratedHeight = Math.min(
              48,
              (Math.abs(row.calibrated_error_mw ?? 0) / maxAbs) * 48,
            );
            return (
              <div
                key={row.hour}
                className="group relative flex-1"
                title={`${row.label} · raw ${signedGw(row.error_mw)} · calibrated ${signedGw(
                  row.calibrated_error_mw,
                )}`}
              >
                <span
                  className="absolute left-0 w-[42%] rounded-[1px] bg-coral-400/60"
                  style={
                    (row.error_mw ?? 0) >= 0
                      ? { bottom: "50%", height: `${rawHeight}%` }
                      : { top: "50%", height: `${rawHeight}%` }
                  }
                />
                <span
                  className="absolute right-0 w-[42%] rounded-[1px] bg-teal-300/80"
                  style={
                    (row.calibrated_error_mw ?? 0) >= 0
                      ? { bottom: "50%", height: `${calibratedHeight}%` }
                      : { top: "50%", height: `${calibratedHeight}%` }
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[8px] uppercase tracking-[0.08em] text-paper/30">
        {[0, 6, 12, 18, 23].map((hour) => (
          <span key={hour}>{hourLabel(hour)}</span>
        ))}
      </div>
    </div>
  );
}
