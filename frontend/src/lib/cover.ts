import { clamp } from "./format";
import type { HourRow } from "../types";

export type CoverTierId = "p80" | "p90" | "stress";

export interface CoverTier {
  id: CoverTierId;
  label: string;
  shortLabel: string;
  description: string;
}

export const COVER_TIERS: CoverTier[] = [
  {
    id: "p80",
    label: "80% confidence",
    shortLabel: "80%",
    description: "Firm in four out of five delivery days, historically.",
  },
  {
    id: "p90",
    label: "90% confidence",
    shortLabel: "90%",
    description: "The planning tier: firm nine hours in ten, historically.",
  },
  {
    id: "stress",
    label: "Stress case",
    shortLabel: "Stress",
    description: "The worst calibrated residual seen in the history window.",
  },
];

export interface CoverSummary {
  peakMw: number;
  peakHour: number;
  averageMw: number;
  mwh: number;
  hoursPositive: number;
}

export function coverForHour(row: HourRow, sharePct: number, tier: CoverTierId): number | null {
  if (row.forecast_mw === null || row.firm_mw[tier] === null) return null;
  const share = clamp(sharePct, 0, 100) / 100;
  const firmWind = Math.max(0, row.firm_mw[tier] ?? 0);
  return Math.max(0, Math.round(share * Math.max(0, row.forecast_mw - firmWind)));
}

export function summariseCover(
  rows: HourRow[],
  sharePct: number,
  tier: CoverTierId,
): CoverSummary | null {
  const observed: Array<{ hour: number; value: number }> = [];
  for (const row of rows) {
    const value = coverForHour(row, sharePct, tier);
    if (value !== null) observed.push({ hour: row.hour, value });
  }
  if (observed.length === 0) return null;
  const values = observed.map((item) => item.value);
  const peak = observed.reduce((best, item) => (item.value > best.value ? item : best), observed[0]);
  return {
    peakMw: peak.value,
    peakHour: peak.hour,
    averageMw: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    mwh: Math.round(values.reduce((sum, value) => sum + value, 0)),
    hoursPositive: values.filter((value) => value > 0).length,
  };
}
