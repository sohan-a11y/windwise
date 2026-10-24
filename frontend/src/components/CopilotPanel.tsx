import { useState } from "react";
import { formatNumber, gwh, mw } from "../lib/format";
import { Icon } from "./ui";

interface CopilotBriefing {
  executive_summary: string;
  recommendation: {
    action: string;
    suggested_procurement_mwh: number;
    peak_shortfall_mw: number;
    confidence_level: string;
  };
  key_risk_drivers: string[];
  regulatory_context: Array<{
    rule_code: string;
    rule_title: string;
    impact_rationale: string;
  }>;
  calibrated_k_factor: number;
  telemetry: {
    provider_model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    latency_ms: number;
    cache_hit: boolean;
  };
}

interface MonteCarloResult {
  iterations: number;
  forecast_mw: number;
  firm_threshold_mw: number;
  loss_of_load_probability: number;
  mean_shortfall_mw: number;
  p95_peaker_call_mw: number;
  p99_peaker_call_mw: number;
  max_shortfall_mw: number;
  expected_energy_unserved_mwh: number;
}

export function CopilotPanel({
  dateText,
  gate,
  sharePct,
  forecastMw,
  firmMw,
}: {
  dateText: string;
  gate: string;
  sharePct: number;
  forecastMw: number;
  firmMw: number;
}) {
  const [briefing, setBriefing] = useState<CopilotBriefing | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [loadingMc, setLoadingMc] = useState(false);

  const fetchBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const resp = await fetch("/api/v1/copilot/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateText, gate, share: sharePct }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setBriefing(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBriefing(false);
    }
  };

  const runMonteCarlo = async () => {
    setLoadingMc(true);
    try {
      const resp = await fetch("/api/v1/jobs/monte-carlo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forecast_mw: forecastMw,
          portfolio_share_pct: sharePct,
          firm_threshold_mw: firmMw,
          iterations: 10000,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const pollResp = await fetch(data.poll_url);
        if (pollResp.ok) {
          const jobData = await pollResp.json();
          setMcResult(jobData.result);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMc(false);
    }
  };

  return (
    <div className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="chip chip-teal">
              <Icon name="spark" size={12} />
              AI Copilot & Evals
            </span>
            <span className="label">Elexon BSC Grounded</span>
          </div>
          <h3 className="display mt-2 text-[clamp(1.5rem,2.2vw,1.9rem)] leading-tight text-ink">
            Day-Ahead Dispatch Copilot & Risk Engine
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Strict Pydantic structured output, local RAG over Elexon BSC P305 cashout rules, token & USD cost telemetry, and 10,000-run Monte Carlo shortfall simulation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchBriefing}
            disabled={loadingBriefing}
            className="btn-primary text-xs"
          >
            {loadingBriefing ? "Synthesizing Briefing..." : briefing ? "Refresh Briefing" : "Generate Desk Briefing"}
          </button>

          <button
            type="button"
            onClick={runMonteCarlo}
            disabled={loadingMc}
            className="btn-ghost text-xs"
          >
            {loadingMc ? "Simulating 10k Samples..." : "Run 10,000 Monte Carlo"}
          </button>
        </div>
      </div>

      {/* Briefing Output */}
      {briefing && (
        <div className="mt-5 space-y-4 rounded-[22px] border border-teal-200/80 bg-teal-50/50 p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-200/50 pb-3">
            <div className="flex items-center gap-2">
              <span className="chip chip-teal text-xs">
                {briefing.recommendation.action.replace(/_/g, " ")}
              </span>
              <span className="label text-teal-800">
                Confidence: {briefing.recommendation.confidence_level.replace(/_/g, " ")}
              </span>
            </div>

            {/* Token & Cost Telemetry */}
            <div className="flex items-center gap-2 text-[11px] text-ink-500 font-mono">
              <span>{briefing.telemetry.total_tokens} tokens</span>
              <span className="text-ink-300">•</span>
              <span>${briefing.telemetry.estimated_cost_usd}</span>
              <span className="text-ink-300">•</span>
              <span>{briefing.telemetry.latency_ms} ms</span>
              {briefing.telemetry.cache_hit && (
                <span className="chip chip-teal text-[9px] py-0.5 px-2">
                  CACHE HIT
                </span>
              )}
            </div>
          </div>

          <p className="font-sans text-sm leading-relaxed text-ink-800">
            {briefing.executive_summary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="card-flat p-4 bg-white/75">
              <span className="label text-ink-700 block mb-2 font-medium">Key Operational Drivers</span>
              <ul className="space-y-1.5 text-xs text-ink-600">
                {briefing.key_risk_drivers.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-teal-600 mt-0.5 font-bold">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card-flat p-4 bg-white/75">
              <span className="label text-ink-700 block mb-2 font-medium">Regulatory Evidence (Elexon BMRS)</span>
              <ul className="space-y-2 text-xs text-ink-600">
                {briefing.regulatory_context.map((r, i) => (
                  <li key={i} className="border-b border-ink-100/60 pb-1.5 last:border-0 last:pb-0">
                    <span className="font-mono font-semibold text-ink-800">{r.rule_code}:</span>{" "}
                    <span className="text-ink-600">{r.impact_rationale}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Monte Carlo Results */}
      {mcResult && (
        <div className="mt-5 card-ink p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <div className="label-light">Distributed Task Worker Result</div>
              <h4 className="display mt-1 text-xl text-paper">
                Monte Carlo Reserve Adequacy ({formatNumber(mcResult.iterations)} iterations)
              </h4>
            </div>
            <div className="text-right">
              <div className="num text-2xl text-teal-300">
                {(mcResult.loss_of_load_probability * 100).toFixed(1)}%
              </div>
              <div className="label-light text-[9px]">Loss of Load Probability</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <div className="rounded-xl bg-white/5 p-3 border border-white/10">
              <span className="label-light text-[9px]">P95 Peaker Call</span>
              <div className="num mt-1 text-base font-semibold text-paper">
                {mw(mcResult.p95_peaker_call_mw)}
              </div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 border border-white/10">
              <span className="label-light text-[9px]">P99 Peaker Call</span>
              <div className="num mt-1 text-base font-semibold text-paper">
                {mw(mcResult.p99_peaker_call_mw)}
              </div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 border border-white/10">
              <span className="label-light text-[9px]">Expected Shortfall (EENS)</span>
              <div className="num mt-1 text-base font-semibold text-paper">
                {gwh(mcResult.expected_energy_unserved_mwh)}
              </div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 border border-white/10">
              <span className="label-light text-[9px]">Max Tail Event</span>
              <div className="num mt-1 text-base font-semibold text-paper">
                {mw(mcResult.max_shortfall_mw)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
