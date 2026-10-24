import { useState } from "react";
import { formatNumber } from "../lib/format";

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
        // Poll job result
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
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
              AI
            </span>
            <h3 className="font-serif text-lg font-semibold text-slate-900">
              Power Systems Dispatch Copilot & Monte Carlo Engine
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Production LLM with strict Pydantic structured output, Elexon BSC RAG grounding, and Celery distributed simulation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchBriefing}
            disabled={loadingBriefing}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {loadingBriefing ? "Synthesizing Briefing..." : briefing ? "Refresh AI Briefing" : "Generate Desk Briefing"}
          </button>

          <button
            type="button"
            onClick={runMonteCarlo}
            disabled={loadingMc}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-all"
          >
            {loadingMc ? "Running 10k Samples..." : "Run 10,000 Monte Carlo"}
          </button>
        </div>
      </div>

      {/* Briefing Output */}
      {briefing && (
        <div className="mt-4 space-y-3 rounded-xl bg-indigo-50/40 p-4 border border-indigo-100/70">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
              Action: {briefing.recommendation.action.replace(/_/g, " ")}
            </span>

            {/* Token & Cost Telemetry */}
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
              <span>{briefing.telemetry.total_tokens} tokens</span>
              <span>•</span>
              <span>${briefing.telemetry.estimated_cost_usd}</span>
              <span>•</span>
              <span>{briefing.telemetry.latency_ms} ms</span>
              {briefing.telemetry.cache_hit && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                  CACHE HIT
                </span>
              )}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-700 font-sans">
            {briefing.executive_summary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
            <div className="rounded-lg bg-white p-3 border border-slate-200/80">
              <span className="font-semibold text-slate-900 block mb-1">Key Operational Drivers</span>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                {briefing.key_risk_drivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg bg-white p-3 border border-slate-200/80">
              <span className="font-semibold text-slate-900 block mb-1">Regulatory Evidence (Elexon BMRS)</span>
              <ul className="space-y-1.5 text-slate-600">
                {briefing.regulatory_context.map((r, i) => (
                  <li key={i}>
                    <strong className="text-slate-800 font-mono text-[11px]">{r.rule_code}:</strong> {r.impact_rationale}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Monte Carlo Results */}
      {mcResult && (
        <div className="mt-4 rounded-xl bg-amber-50/40 p-4 border border-amber-100/70">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-900">
              Distributed Monte Carlo Simulation ({formatNumber(mcResult.iterations)} iterations)
            </span>
            <span className="font-mono text-[11px] text-amber-700">
              Loss of Load Probability: {(mcResult.loss_of_load_probability * 100).toFixed(1)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className="rounded bg-white p-2 border border-slate-200">
              <span className="text-slate-500 text-[10px]">P95 Peaker Call</span>
              <div className="font-mono font-bold text-slate-900">{formatNumber(mcResult.p95_peaker_call_mw)} MW</div>
            </div>
            <div className="rounded bg-white p-2 border border-slate-200">
              <span className="text-slate-500 text-[10px]">P99 Peaker Call</span>
              <div className="font-mono font-bold text-slate-900">{formatNumber(mcResult.p99_peaker_call_mw)} MW</div>
            </div>
            <div className="rounded bg-white p-2 border border-slate-200">
              <span className="text-slate-500 text-[10px]">Expected Shortfall (EENS)</span>
              <div className="font-mono font-bold text-slate-900">{formatNumber(mcResult.expected_energy_unserved_mwh)} MWh</div>
            </div>
            <div className="rounded bg-white p-2 border border-slate-200">
              <span className="text-slate-500 text-[10px]">Maximum Single Event</span>
              <div className="font-mono font-bold text-slate-900">{formatNumber(mcResult.max_shortfall_mw)} MW</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
