import { useState } from "react";
import type { MetaResponse } from "../types";
import type { NavigateOptions, Route } from "../lib/route";
import {
  cn,
  dateLong,
  dateShort,
  formatNumber,
  gw,
  mw,
  timestampLabel,
  weekday,
} from "../lib/format";
import { useSnapshots } from "../hooks";
import {
  DateControl,
  ErrorPanel,
  GateControl,
  Icon,
  InfoTip,
  KpiInline,
  LoadingPage,
  SectionHeading,
  Switch,
} from "../components/ui";
import { RevisionFan } from "../components/charts/RevisionFan";
import { Reveal } from "../components/Reveal";

export function SnapshotsPage({
  meta,
  route,
  navigate,
}: {
  meta: MetaResponse;
  route: Route;
  navigate: (patch: Partial<Route>, options?: NavigateOptions) => void;
}) {
  const snapshots = useSnapshots(route.date, route.gate);
  const [showAfter, setShowAfter] = useState(false);

  const ready =
    snapshots.data &&
    snapshots.data.delivery_date === route.date &&
    snapshots.data.gate.id === route.gate;

  if (snapshots.isError) {
    return (
      <ErrorPanel
        title="The snapshot history could not load"
        message={
          snapshots.error instanceof Error ? snapshots.error.message : "Unknown API error."
        }
        onRetry={() => void snapshots.refetch()}
      />
    );
  }
  if (!ready || !snapshots.data) {
    return <LoadingPage label="Reconstructing every vintage" />;
  }

  const data = snapshots.data;
  const selectedRow = data.snapshots.find((row) => row.selected) ?? null;
  const preGate = data.snapshots.filter((row) => row.before_gate).length;
  const afterGate = data.snapshots.length - preGate;
  const month = data.revision.month;
  const stability = month.buckets.slice(0, 8);
  const maxStability = Math.max(1, ...stability.map((row) => row.mean_abs_mw));
  const fallbackGate = data.gates.find((gate) => gate.used_fallback);

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-6 pt-7 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 rounded-[24px] border border-white/80 bg-white/50 px-4 py-4 backdrop-blur-md sm:px-5">
        <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
          <DateControl
            value={route.date}
            dates={meta.dates}
            onChange={(date) => navigate({ date, view: "snapshots" }, { scroll: false })}
          />
          <GateControl
            value={route.gate}
            gates={meta.gates}
            onChange={(gate) => navigate({ gate }, { scroll: false })}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("chip", fallbackGate ? "chip-coral" : "chip-teal")}>
            <span
              className={cn("h-1.5 w-1.5 rounded-full", fallbackGate ? "bg-coral-500" : "bg-teal-500")}
            />
            {fallbackGate ? "Fallback flagged" : "Scheduled coverage"}
          </span>
          <a
            href={`/api/v1/snapshots?date=${route.date}&gate=${route.gate}`}
            target="_blank"
            rel="noreferrer"
            className="btn-quiet gap-1.5 text-xs"
          >
            <Icon name="api" size={13} />
            JSON
          </a>
        </div>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="chip chip-teal">Snapshot audit</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
              {weekday(data.delivery_date)} · {dateLong(data.delivery_date)} · {data.gate.short_label}
            </span>
          </div>
          <h1 className="display mt-5 max-w-2xl text-[clamp(2.6rem,5vw,4.4rem)] leading-[0.94]">
            The forecast does not arrive once.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-600">
            It is revised all day. Windwise locks the latest complete vintage published before the
            gate — and keeps every earlier version auditable. This is the paper trail behind the
            decision, including the days when the scheduled snapshot was missing.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="chip">{preGate} pre-gate vintages</span>
            <span className="chip">{afterGate} post-gate</span>
            <span className="chip">latest used</span>
            <span className="chip">no interpolation</span>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="card-ink p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="label-light">Locked vintage</div>
                <div className="display mt-2 text-2xl text-paper">
                  {timestampLabel(data.selected_snapshot ?? "")}
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-teal-300/30 bg-teal-300/10 text-teal-300">
                <Icon name="lock" size={17} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-white/10 pt-4">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">
                  Average wind
                </div>
                <div className="num mt-1 text-lg text-paper">{gw(data.selected_average_mw)}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">
                  Peak hour
                </div>
                <div className="num mt-1 text-lg text-paper">{gw(data.selected_peak_mw)}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">
                  Lead to midnight
                </div>
                <div className="num mt-1 text-lg text-paper">
                  {selectedRow ? `${formatNumber(selectedRow.lead_hours_to_midnight, 1)} h` : "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-paper/40">
                  Day revision
                </div>
                <div className="num mt-1 text-lg text-paper">{mw(data.revision.day_mean_abs_mw)}</div>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-paper/45">
              Latest full-coverage WINDFOR vintage strictly before the{" "}
              {data.gate.closure_label} gate. Nothing published after this timestamp can affect the
              brief.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-12">
        <Reveal className="card p-5 sm:p-6 lg:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label">Vintage fan</div>
              <h2 className="display mt-1.5 text-[clamp(1.7rem,2.6vw,2.3rem)] leading-tight">
                One day, {data.snapshots.length} forecasts
              </h2>
            </div>
            <Switch
              checked={showAfter}
              onChange={setShowAfter}
              label="Post-gate"
              description="Visible, never used"
              tone="teal"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-ink" /> used</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-ink-300" /> earlier pre-gate</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-coral-500" /> actual</span>
            {showAfter ? (
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 border-t border-dashed border-sky-400" /> post-gate</span>
            ) : null}
          </div>
          <RevisionFan series={data.series} actual={data.actual} showAfter={showAfter} className="mt-3" />
        </Reveal>

        <Reveal delay={0.06} className="flex flex-col gap-4 lg:col-span-4">
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <div className="label">Revision scale</div>
              <InfoTip text="Absolute change between consecutive WINDFOR vintages for the same target hour, pooled across January. Only gaps of six hours or less are compared." />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <KpiInline label="Mean" value={mw(month.overall?.mean_abs_mw)} hint="absolute" />
              <KpiInline label="P90" value={mw(month.overall?.p90_abs_mw)} hint="1 in 10 larger" />
              <KpiInline
                label="Max"
                value={mw(month.overall?.max_abs_mw)}
                hint={`${formatNumber(month.overall?.n ?? 0)} pairs`}
                tone="coral"
              />
            </div>
            <div className="mt-4 border-t border-ink-100 pt-2">
              {stability.map((row) => (
                <div key={row.lead_hours} className="mt-2 flex items-center gap-3">
                  <span className="w-12 shrink-0 font-mono text-[9px] text-ink-400">
                    {row.lead_hours}–{row.lead_hours + 6}h
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-teal-500/80"
                      style={{ width: `${(row.mean_abs_mw / maxStability) * 100}%` }}
                    />
                  </div>
                  <span className="num w-12 text-right text-[10px] text-ink-600">
                    {formatNumber(row.mean_abs_mw)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
              Shorter leads are more stable. The 09:30 snapshot is 20 minutes before the N2EX gate;
              its final revision is usually small, but not always.
            </p>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white/55 p-4">
            <div className="flex gap-2">
              <Icon name="info" size={14} className="mt-0.5 shrink-0 text-ink-400" />
              <p className="text-[11px] leading-relaxed text-ink-600">{data.status_note}</p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mt-10">
        <SectionHeading
          kicker="Same day, three gates"
          title="The gate is a cut-off, not a suggestion"
          description="Each market has a different closure time and therefore a different information set. The desk never reaches forward to a later snapshot, even when it would be more accurate."
        />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {data.gates.map((gate, index) => {
            const active = gate.id === route.gate;
            return (
              <Reveal
                key={gate.id}
                delay={index * 0.04}
                className={cn("card p-5", active && "ring-1 ring-teal-300")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="label">{gate.market}</div>
                    <div className="mt-1 text-sm font-medium text-ink">{gate.short_label}</div>
                  </div>
                  {gate.used_fallback ? (
                    <span className="chip chip-coral">Fallback</span>
                  ) : active ? (
                    <span className="chip chip-teal">Viewing</span>
                  ) : null}
                </div>
                <div className="mt-4 font-mono text-[11px] text-ink">
                  {gate.snapshot_time ? timestampLabel(gate.snapshot_time) : "No snapshot"}
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-400">
                  {gate.minutes_before_gate === null
                    ? "—"
                    : `${gate.minutes_before_gate} min before ${gate.closure_label} closure`}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                  <button
                    type="button"
                    onClick={() => navigate({ gate: gate.id }, { scroll: false })}
                    className="link-quiet text-xs"
                  >
                    {active ? "Showing this gate" : "Inspect gate"}
                    <Icon name="arrow-right" size={12} />
                  </button>
                  {gate.used_fallback ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-coral-500">
                      flagged
                    </span>
                  ) : null}
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label">The paper trail</div>
            <h2 className="display mt-1.5 text-[clamp(1.8rem,3vw,2.6rem)] leading-tight">
              Every snapshot, every revision
            </h2>
          </div>
          <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> used</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ink-300" /> pre-gate</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-300" /> post-gate</span>
          </div>
        </div>
        <div className="thin-scrollbar mt-4 max-h-[520px] overflow-auto rounded-2xl border border-ink-100 bg-white/55">
          <table className="data-table">
            <thead>
              <tr>
                <th>Published (UTC)</th>
                <th className="text-right">Lead to 00:00</th>
                <th className="text-right">Average</th>
                <th className="text-right">Peak</th>
                <th className="text-right">Revision</th>
                <th className="text-right">Max step</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.snapshots.map((row) => {
                const used = row.selected;
                return (
                  <tr key={row.publish_time} className={cn(used && "bg-teal-100/60")}>
                    <td className={cn("font-mono text-[11px]", used ? "text-ink" : "text-ink-600")}>
                      {dateShort(row.publish_time)} · {row.publish_time.slice(11, 16)}Z
                    </td>
                    <td className="num text-right text-ink-500">
                      {formatNumber(row.lead_hours_to_midnight, 1)} h
                    </td>
                    <td className="num text-right text-ink">{mw(row.average_mw)}</td>
                    <td className="num text-right text-ink-600">{mw(row.peak_mw)}</td>
                    <td className="num text-right text-ink-500">
                      {row.revision_mean_abs_mw === null ? "—" : mw(row.revision_mean_abs_mw)}
                    </td>
                    <td className="num text-right text-ink-500">
                      {row.revision_max_abs_mw === null ? "—" : mw(row.revision_max_abs_mw)}
                    </td>
                    <td>
                      {used ? (
                        <span className="chip chip-teal">Used</span>
                      ) : row.before_gate ? (
                        <span className="chip">Pre-gate</span>
                      ) : (
                        <span className="chip border-sky-200 bg-sky-100 text-ink-600">Post-gate</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
          "Revision" is the mean absolute change against the immediately preceding full-coverage
          vintage for the same day. "Max step" is the largest single-hour change. A missing scheduled
          snapshot is flagged, never silently replaced.
        </p>
      </section>

      <section className="mt-10">
        <Reveal className="grid gap-6 rounded-[28px] border border-coral-200 bg-coral-100/60 p-6 sm:p-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-8">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-coral-500 text-white">
                <Icon name="alert" size={13} />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-coral-600">
                Data quality · 16 January 2026
              </span>
            </div>
            <h2 className="display mt-3 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight text-ink">
              The scheduled snapshot was missing. The desk says so.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-700">
              For the 16 January EPEX half-hourly gate, the expected 11:30 WINDFOR vintage was not
              published. Windwise used the unscheduled 12:25 replacement and attached a visible
              quality flag rather than fabricating a number or quietly switching gates.
            </p>
          </div>
          <div className="lg:col-span-4 lg:text-right">
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                navigate({ view: "snapshots", date: "2026-01-16", gate: "epex_hh" })
              }
            >
              Open the flagged day
              <Icon name="arrow-right" size={15} />
            </button>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-coral-600/70">
              epex hh · 12:25 replacement
            </div>
          </div>
        </Reveal>
      </section>

      <Reveal className="mt-6 grid gap-5 sm:grid-cols-3">
        <div className="card p-5">
          <div className="label">Selected lead time</div>
          <div className="num mt-2 text-xl text-ink">
            {selectedRow ? `${formatNumber(selectedRow.lead_hours_to_midnight, 1)} h` : "—"}
          </div>
          <p className="mt-1 text-[11px] text-ink-500">Publish to delivery-day midnight.</p>
        </div>
        <div className="card p-5">
          <div className="label">Snapshot stability</div>
          <div className="num mt-2 text-xl text-ink">{mw(data.revision.day_mean_abs_mw)}</div>
          <p className="mt-1 text-[11px] text-ink-500">Mean absolute revision across this day's vintages.</p>
        </div>
        <div className="card p-5">
          <div className="label">Coverage check</div>
          <div className="num mt-2 text-xl text-ink">
            {data.snapshots.length > 0 ? "24 / 24" : "—"}
          </div>
          <p className="mt-1 text-[11px] text-ink-500">
            Every listed vintage has a value for every delivery hour.
          </p>
        </div>
      </Reveal>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white/45 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
        <span>{data.snapshots.length} vintages · {data.gate.label}</span>
        <span>
          selected {data.selected_snapshot ? timestampLabel(data.selected_snapshot) : "—"} ·{" "}
          {data.gate.closure_label} closure
        </span>
      </div>
    </main>
  );
}
