import type { MetaResponse } from "../types";
import type { NavigateOptions, Route } from "../lib/route";
import { cn, formatNumber, gw, pct } from "../lib/format";
import { exportUrl } from "../api";
import { Icon, InfoTip, KpiInline, SectionHeading } from "../components/ui";
import { Reveal } from "../components/Reveal";

const RULES = [
  {
    decision: "Which snapshot",
    rule: "Latest WINDFOR vintage with all 24 delivery hours, published strictly before gate closure.",
    why: "A later revision is better information, but it did not exist when the buyer committed.",
  },
  {
    decision: "Hourly actual",
    rule: "Mean of the two FUELHH half-hourly WIND settlement periods in each hour.",
    why: "WINDFOR is hourly. Averaging the two periods gives a like-for-like comparison without interpolation.",
  },
  {
    decision: "Calibration",
    rule: "k = Σactual / Σforecast over complete delivery days ≤ D−2, expanding window, minimum 7 days.",
    why: "One parameter can remove a persistent bias without overfitting 744 observations.",
  },
  {
    decision: "Uncertainty",
    rule: "Empirical quantiles of leave-one-day-out calibrated residuals (actual − k·forecast).",
    why: "Each day is scored with a k estimated without that day. In-sample fit would understate the band.",
  },
  {
    decision: "Firm wind",
    rule: "max(0, k·forecast + q). 80% tier uses P20; 90% tier uses P10; stress uses the minimum residual.",
    why: "Firm wind is a one-sided statement: how much wind can be relied on, not where it will land.",
  },
  {
    decision: "Cover",
    rule: "share × max(0, forecast − firm wind), floored at zero. MWh = Σ hourly MW.",
    why: "The buyer covers the shortfall against their planned wind, not the whole national fleet.",
  },
  {
    decision: "Evaluation",
    rule: "Walk-forward only. Raw and calibrated metrics reported separately; realised coverage disclosed.",
    why: "A model that grades itself in-sample is a marketing document, not an audit.",
  },
];

export function MethodPage({
  meta,
  navigate,
}: {
  meta: MetaResponse;
  route: Route;
  navigate: (patch: Partial<Route>, options?: NavigateOptions) => void;
}) {
  const dataset = meta.dataset;
  const sourceEntries = Object.entries(dataset.sources ?? {});
  const hourlyCsv = exportUrl("hourly", { date: "2026-01-31", gate: "n2ex", share: 10 });
  const accuracyCsv = exportUrl("accuracy", { gate: "n2ex" });

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-6 pt-7 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/80 bg-white/50 px-4 py-3.5 backdrop-blur-md sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-teal">Method note</span>
          <span className="chip">v1.0</span>
          <span className="chip">Historical replay</span>
          <span className="chip">{dataset.checksum_verified ? "checksum verified" : "checksum unchecked"}</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/sohan-a11y/windwise/blob/main/docs/METHOD.md"
            target="_blank"
            rel="noreferrer"
            className="btn-quiet gap-1.5 text-xs"
          >
            <Icon name="github" size={13} />
            Read on GitHub
          </a>
          <a href="/api/docs" target="_blank" rel="noreferrer" className="btn-ghost gap-1.5 text-xs">
            <Icon name="api" size={13} />
            OpenAPI
          </a>
        </div>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2 w-2 rounded-full bg-teal-500" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">
              Method, data & limitations
            </span>
          </div>
          <h1 className="display mt-5 max-w-3xl text-[clamp(2.6rem,5.2vw,4.6rem)] leading-[0.94]">
            A small model, honestly bounded.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-600">
            Windwise does not predict prices, demand, or the weather. It takes one public forecast,
            removes a measured bias, quantifies what remains, and turns that into thermal cover. The
            restraint is the product.
          </p>
        </div>

        <div className="lg:col-span-5">
          <div className="card-ink p-6">
            <div className="label-light">The only fitted parameter</div>
            <div className="mt-4 font-display text-[clamp(2.1rem,3.4vw,2.9rem)] leading-none text-paper">
              k =
              <span className="mx-2 inline-flex flex-col items-center align-middle text-[0.52em] leading-tight">
                <span className="border-b border-paper/40 px-1 pb-0.5">Σ actual</span>
                <span className="px-1 pt-0.5">Σ forecast</span>
              </span>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-paper/55">
              Estimated over complete delivery days up to D-2. On 31 January: k ≈ 0.861 from 29
              days, or 696 hourly pairs. No other coefficient is fitted.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-paper/35">Min days</div>
                <div className="num mt-1 text-sm text-paper">7</div>
              </div>
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-paper/35">Calibrated</div>
                <div className="num mt-1 text-sm text-teal-300">552 h</div>
              </div>
              <div>
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-paper/35">Look-ahead</div>
                <div className="num mt-1 text-sm text-paper">none</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          kicker="Pipeline"
          title="From public API to a covered hour"
          description="Five deterministic steps. No live calls at request time: the Elexon snapshot is committed, checksum-verified, and loaded read-only into memory."
        />
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            {
              n: "01",
              title: "Ingest",
              body: "FUELHH WIND actuals + every WINDFOR vintage for the delivery window.",
              meta: "1,488 half-hours · 256 vintages",
            },
            {
              n: "02",
              title: "Lock the gate",
              body: "Choose the latest full-coverage vintage strictly before closure.",
              meta: "N2EX 09:50 · EPEX 09:20 · HH 15:30",
            },
            {
              n: "03",
              title: "Align",
              body: "Average the two settlement periods into 24 hourly actuals.",
              meta: "no interpolation",
            },
            {
              n: "04",
              title: "Calibrate",
              body: "Estimate k on history ≤ D−2, then leave-one-day-out residual quantiles.",
              meta: "expanding · walk-forward",
            },
            {
              n: "05",
              title: "Decide",
              body: "Firm wind by tier, then share × shortfall, capped at zero.",
              meta: "MWh = Σ hourly MW",
            },
          ].map((step, index) => (
            <Reveal key={step.n} delay={index * 0.04} className="relative">
              <div className="card h-full p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-teal-700">{step.n}</span>
                  {index < 4 ? (
                    <Icon name="arrow-right" size={13} className="hidden text-ink-300 md:block" />
                  ) : (
                    <Icon name="check" size={13} className="text-teal-600" />
                  )}
                </div>
                <div className="mt-4 text-sm font-medium text-ink">{step.title}</div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{step.body}</p>
                <div className="mt-4 border-t border-ink-100 pt-2 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-400">
                  {step.meta}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-12">
        <Reveal className="card p-5 sm:p-6 lg:col-span-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="label">Decision ledger</div>
              <h2 className="display mt-1.5 text-[clamp(1.8rem,3vw,2.5rem)] leading-tight">
                Seven rules, no exceptions
              </h2>
            </div>
            <InfoTip text="These rules are enforced in code and covered by tests, including two mutation tests that prove D−1 actuals and post-gate revisions cannot leak into calibration." />
          </div>
          <div className="mt-5 divide-y divide-ink-100">
            {RULES.map((row, index) => (
              <div key={row.decision} className="grid gap-2 py-3.5 sm:grid-cols-[130px_1fr]">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[9px] text-ink-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-medium text-ink">{row.decision}</span>
                </div>
                <div>
                  <div className="font-mono text-[11px] leading-relaxed text-ink-700">{row.rule}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-ink-400">{row.why}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.06} className="flex flex-col gap-4 lg:col-span-4">
          <div className="rounded-[28px] border border-coral-200 bg-coral-100/60 p-5">
            <div className="flex items-center gap-2">
              <Icon name="alert" size={14} className="text-coral-600" />
              <div className="label text-coral-600">What this is not</div>
            </div>
            <ul className="mt-4 space-y-2.5 text-[11px] leading-relaxed text-ink-700">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-coral-400" />
                Not a price forecast. No bids, no stack, no imbalance prices.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-coral-400" />
                Not a demand model. The client's wind share is an input, not an inference.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-coral-400" />
                Not a 95% guarantee. The nominal 95% band realised 90.6% in this sample.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-coral-400" />
                Not a seasonal model. One month, one winter, no regime change.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-coral-400" />
                Not a trading system. It places no orders and has no market connectivity.
              </li>
            </ul>
          </div>
          <div className="card flex-1 p-5">
            <div className="label">The honest weakness</div>
            <p className="mt-2 text-xs leading-relaxed text-ink-600">
              A single ratio assumes the bias is stable across wind levels and time. January says
              otherwise: the high-wind hours missed by more than the low-wind hours, and the 28
              January tail broke every band. The desk exposes that instead of tuning it away.
            </p>
            <button
              type="button"
              onClick={() => navigate({ view: "accuracy" })}
              className="link-quiet mt-4 text-xs"
            >
              See the error record
              <Icon name="arrow-right" size={12} />
            </button>
          </div>
        </Reveal>
      </section>

      <section className="mt-10">
        <SectionHeading
          kicker="Provenance"
          title="The data is the argument"
          description="Only two public Elexon datasets are used. The snapshot is committed to the repository, hashed, and verified on every boot. If the file changes, the health check fails."
          action={
            <a
              href="https://github.com/sohan-a11y/windwise/blob/main/backend/app/data/manifest.json"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost gap-1.5 text-xs"
            >
              <Icon name="external" size={13} />
              Manifest
            </a>
          }
        />
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          <Reveal className="card p-5 sm:p-6 lg:col-span-7">
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <KpiInline
                label="Actual half-hours"
                value={formatNumber(dataset.counts.actual_half_hours ?? 0)}
                hint={`${dataset.counts.actual_delivery_days ?? 31} delivery days · complete`}
              />
              <KpiInline
                label="Forecast rows"
                value={formatNumber(dataset.counts.forecast_rows ?? 0)}
                hint={`${dataset.counts.forecast_snapshots ?? 0} WINDFOR vintages`}
              />
              <KpiInline
                label="Actual range"
                value={`${gw(dataset.ranges_mw.actual?.min)} – ${gw(dataset.ranges_mw.actual?.max)}`}
                hint="national wind generation"
              />
              <KpiInline
                label="Forecast range"
                value={`${gw(dataset.ranges_mw.forecast?.min)} – ${gw(dataset.ranges_mw.forecast?.max)}`}
                hint="hourly WINDFOR values"
              />
            </div>
            <div className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-[11px]">
              {sourceEntries.map(([key, source]) => (
                <div key={key} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-400">
                    {key}
                  </span>
                  <a
                    href={source.documentation}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-600 hover:text-teal-700"
                  >
                    {source.dataset}
                    {source.filter ? ` · ${source.filter}` : ""}
                    <Icon name="external" size={10} />
                  </a>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl bg-ink px-3.5 py-3 font-mono text-[9px] leading-relaxed text-teal-200/80">
              <div className="text-paper/35">sha256 · {dataset.sha256?.slice(0, 32)}…</div>
              <div className="mt-1 break-all text-paper/70">{dataset.sha256}</div>
              <div className="mt-2 text-paper/35">
                {formatNumber(dataset.database_bytes ?? 0)} bytes · generated{" "}
                {dataset.generated_at_utc?.slice(0, 19).replace("T", " ")}Z
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={cn("chip", dataset.checksum_verified ? "chip-teal" : "chip-coral")}>
                {dataset.checksum_verified ? "checksum verified at boot" : "checksum mismatch"}
              </span>
              <span className="chip">read-only sqlite</span>
              <span className="chip">no runtime API dependency</span>
            </div>
          </Reveal>

          <Reveal delay={0.06} className="flex flex-col gap-4 lg:col-span-5">
            <div className="card p-5">
              <div className="label">Reproduce it</div>
              <div className="mt-3 space-y-2">
                {[
                  "python backend/scripts/ingest.py",
                  "pytest backend/tests -q",
                  "npm --prefix frontend run build",
                ].map((command) => (
                  <div
                    key={command}
                    className="overflow-x-auto rounded-xl border border-ink-100 bg-[#F6F8F4] px-3 py-2 font-mono text-[10px] text-ink-700"
                  >
                    <span className="mr-2 text-teal-600">$</span>
                    {command}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
                Ingestion pulls only FUELHH and WINDFOR. The committed SQLite file is deterministic
                for a fixed payload; its manifest pins the exact bytes shipped.
              </p>
            </div>
            <div className="card flex-1 p-5">
              <div className="flex items-center gap-2">
                <div className="label">Coverage gates</div>
                <InfoTip text="Every gate covers all 31 delivery days. A missing scheduled snapshot is explicitly flagged." />
              </div>
              <div className="mt-3 space-y-2.5">
                {Object.entries(dataset.gate_coverage ?? {}).map(([gate, coverage]) => (
                  <div key={gate} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-600">
                      {gate.replaceAll("_", " ")}
                    </span>
                    <span className="num text-[11px] text-teal-700">
                      {coverage.days_with_cover}/31 days
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-ink-100 pt-3 text-[11px] leading-relaxed text-ink-500">
                The 16 January EPEX HH scheduled 11:30 vintage was absent; an unscheduled 12:25
                replacement is used and flagged on the day.
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          kicker="Interface"
          title="Read it, query it, export it"
          description="The same numbers power the interface, the CSV downloads, and the documented API. Analytics are pure stdlib Python; the server is read-only."
        />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Reveal className="card flex flex-col p-5">
            <div className="flex items-center justify-between">
              <div className="label">Desk brief</div>
              <Icon name="table" size={15} className="text-ink-300" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-600">
              One row per delivery hour: forecast, calibrated, both bands, firm wind, cover, actual
              and error.
            </p>
            <a href={hourlyCsv} download className="link-quiet mt-4 text-xs">
              <Icon name="download" size={13} />
              31 Jan hourly CSV
            </a>
            <a
              href="/api/v1/desk?date=2026-01-31&gate=n2ex&share=10"
              target="_blank"
              rel="noreferrer"
              className="link-quiet mt-2 text-xs"
            >
              <Icon name="api" size={13} />
              /api/v1/desk
            </a>
          </Reveal>
          <Reveal delay={0.04} className="card flex flex-col p-5">
            <div className="flex items-center justify-between">
              <div className="label">Accuracy ledger</div>
              <Icon name="check" size={15} className="text-ink-300" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-600">
              Daily raw and calibrated metrics, band hits, coverage, gate comparison, revisions and
              worst hours.
            </p>
            <a href={accuracyCsv} download className="link-quiet mt-4 text-xs">
              <Icon name="download" size={13} />
              Accuracy CSV
            </a>
            <a
              href="/api/v1/accuracy?gate=n2ex"
              target="_blank"
              rel="noreferrer"
              className="link-quiet mt-2 text-xs"
            >
              <Icon name="api" size={13} />
              /api/v1/accuracy
            </a>
          </Reveal>
          <Reveal delay={0.08} className="card flex flex-col p-5">
            <div className="flex items-center justify-between">
              <div className="label">OpenAPI</div>
              <Icon name="api" size={15} className="text-ink-300" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-600">
              Interactive FastAPI documentation with typed parameters, examples and response
              schemas.
            </p>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="link-quiet mt-4 text-xs">
              <Icon name="external" size={13} />
              Swagger UI
            </a>
            <a href="/api/openapi.json" target="_blank" rel="noreferrer" className="link-quiet mt-2 text-xs">
              <Icon name="api" size={13} />
              OpenAPI JSON
            </a>
          </Reveal>
        </div>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-12">
        <Reveal className="card p-5 sm:p-6 lg:col-span-7">
          <div className="label">Questions a reviewer should ask</div>
          <div className="mt-3">
            {[
              {
                q: "Why calibrate with a single ratio instead of a model?",
                a: "With 552 out-of-sample hours, a flexible model would fit noise and hide its uncertainty. One parameter is auditable, removes the dominant bias (+1.84 GW to +0.11 GW), and leaves a residual distribution that can be tested. The honest gain is 40.5% lower MAE, not a perfect forecast.",
              },
              {
                q: "Why does calibration only start on 9 January?",
                a: "The rule requires seven complete delivery days at or before D−2. On 8 January there are only six. The desk stays provisional rather than inventing a band from too little history.",
              },
              {
                q: "What happens if the scheduled snapshot is missing?",
                a: "The desk uses the latest complete vintage before the gate and attaches a visible flag. On 16 January the EPEX HH 11:30 snapshot was absent; the unscheduled 12:25 replacement is used, with the anomaly shown on the day and in the snapshot audit.",
              },
              {
                q: "Is the 95% band a 95% guarantee?",
                a: "No. It is the empirical 2.5–97.5% residual interval, and it realised 90.6% coverage out of sample. The interface says so next to the number. The stress tier is the worst residual observed, not a bound.",
              },
              {
                q: "Does the cover number represent a trade?",
                a: "No. It is a thermal-capacity proxy: the MW a buyer would hold against their share of a national wind shortfall. No prices, orders, or counterparties are modelled.",
              },
            ].map((item) => (
              <details key={item.q} className="group border-b border-ink-100 py-3 last:border-0">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-xs font-medium text-ink marker:hidden">
                  {item.q}
                  <Icon
                    name="plus"
                    size={14}
                    className="mt-0.5 shrink-0 text-ink-400 transition-transform group-open:rotate-45"
                  />
                </summary>
                <p className="mt-2 pr-6 text-[11px] leading-relaxed text-ink-500">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.06} className="lg:col-span-5">
          <div id="ai" className="card h-full p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="label">AI tool disclosure</div>
              <span className="chip chip-sand">explicit</span>
            </div>
            <h3 className="display mt-2 text-2xl leading-tight">Built with AI. Checked by tests.</h3>
            <p className="mt-3 text-xs leading-relaxed text-ink-600">
              Windwise was built with an AI coding agent (OpenCode, DeepSeek V4.1 Flash Free) under
              human direction. The agent wrote application code, tests, and documentation drafts.
              The author set the scope, chose the method, and reviewed the output.
            </p>
            <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-ink-500">
              <li className="flex gap-2">
                <Icon name="check" size={12} className="mt-0.5 shrink-0 text-teal-600" />
                No data was generated by AI. Every row comes from Elexon FUELHH or WINDFOR.
              </li>
              <li className="flex gap-2">
                <Icon name="check" size={12} className="mt-0.5 shrink-0 text-teal-600" />
                37 backend tests, including no-look-ahead mutation tests, pass against the
                committed snapshot.
              </li>
              <li className="flex gap-2">
                <Icon name="check" size={12} className="mt-0.5 shrink-0 text-teal-600" />
                The disclosure is repeated in the README, as required by the brief.
              </li>
            </ul>
            <a
              href="https://github.com/sohan-a11y/windwise#ai-tool-disclosure"
              target="_blank"
              rel="noreferrer"
              className="link-quiet mt-4 text-xs"
            >
              Read the full disclosure
              <Icon name="external" size={12} />
            </a>
          </div>
        </Reveal>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white/45 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">
        <span>Windwise · decision-support prototype · not affiliated with Elexon</span>
        <span>{pct(80.6, 1)} realised 80% coverage · 37 tests · no look-ahead</span>
      </div>
    </main>
  );
}
