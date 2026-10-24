export type GateId = "n2ex" | "epex" | "epex_hh";
export type View = "desk" | "accuracy" | "snapshots" | "method";
export type DayStatus = "calibrated" | "provisional";

export interface GateInfo {
  id: GateId;
  label: string;
  short_label: string;
  market: string;
  closure_label: string;
  expected_snapshot: string;
  product: string;
  timezone: string;
}

export interface Gate extends GateInfo {
  closure_utc: string;
  snapshot_time: string;
  minutes_before_gate: number;
  decision_day: string;
}

export interface MetaDate {
  date: string;
  status: DayStatus;
  snapshot_time: string | null;
  fallback: boolean | null;
}

export interface DatasetSource {
  dataset: string;
  filter?: string;
  endpoint: string;
  documentation: string;
}

export interface MetaResponse {
  product: string;
  tagline: string;
  mode: string;
  delivery_window: { start: string; end: string; decision_window: string };
  gates: GateInfo[];
  default_gate: GateId;
  dates: MetaDate[];
  dataset: {
    counts: {
      actual_half_hours: number;
      actual_delivery_days: number;
      forecast_rows: number;
      forecast_snapshots: number;
    };
    ranges_mw: {
      actual: { min: number; max: number };
      forecast: { min: number; max: number };
    };
    gate_coverage: Record<
      string,
      { days_with_cover: number; fallbacks: Array<Record<string, string>> }
    >;
    generated_at_utc: string;
    sha256: string;
    database_bytes: number;
    checksum_verified: boolean;
    sources: Record<string, DatasetSource>;
  };
  method: {
    hourly_matching: string;
    calibration: string;
    bands: string;
    first_calibrated_day: string;
  };
  api: { docs: string; openapi: string; endpoints: string[] };
  disclaimer: string;
}

export interface Metrics {
  n: number;
  bias_mw: number | null;
  mae_mw: number | null;
  rmse_mw: number | null;
  mape_pct: number | null;
  correlation: number | null;
  p10_error_mw: number | null;
  p50_error_mw: number | null;
  p90_error_mw: number | null;
  p90_abs_error_mw: number | null;
  overforecast_hours: number;
  overforecast_share_pct: number | null;
  mean_shortfall_mw: number | null;
  p90_shortfall_mw: number | null;
  max_shortfall_mw: number | null;
}

export interface Calibration {
  available: boolean;
  k: number | null;
  days_used: number;
  hours_used: number;
  days_required: number;
  history_from: string | null;
  history_to: string | null;
  rule: string;
  residuals: Record<string, number | null>;
  band80_width_mw: number | null;
  method: string;
}

export interface HourRow {
  hour: number;
  label: string;
  forecast_mw: number | null;
  calibrated_mw: number | null;
  band80_low_mw: number | null;
  band80_high_mw: number | null;
  band95_low_mw: number | null;
  band95_high_mw: number | null;
  firm_mw: Record<"p80" | "p90" | "stress", number | null>;
  forecast_share_mw: number | null;
  cover_mw: Record<"p80" | "p90" | "stress", number | null>;
  actual_mw: number | null;
  error_mw: number | null;
  calibrated_error_mw: number | null;
  shortfall_mw: number | null;
}

export interface CoverSummary {
  peak_mw: number;
  peak_hour: number;
  average_mw: number;
  mwh: number;
  hours_positive: number;
}

export interface Reliability {
  n: number;
  levels: Record<"p80" | "p90" | "stress", { hits: number; empirical_pct: number | null }>;
  note: string;
}

export interface DataQuality {
  snapshot_publish_time: string;
  latest_available_snapshot: string | null;
  used_fallback: boolean;
  expected_snapshot_missing: boolean;
  expected_snapshot_time: string;
  note: string | null;
  actual_hours_available: number;
  forecast_hours_available: number;
}

export interface Revision {
  previous_snapshot: string;
  mean_abs_change_mw: number;
  max_abs_change_mw: number;
  mean_signed_change_mw: number;
  hours_changed_over_500mw: number;
}

export interface Outturn {
  available: boolean;
  reason?: string;
  raw?: Metrics;
  calibrated?: Metrics | null;
  hours_in_band_80?: number;
  hours_in_band_95?: number;
  hours_above_firm_90?: number;
  hours_above_stress?: number;
  worst_hour?: number;
  worst_error_mw?: number;
  mean_actual_mw?: number;
}

export interface DeskResponse {
  delivery_date: string;
  gate: Gate;
  status: DayStatus;
  status_label: string;
  status_detail: string;
  calibration: Calibration;
  share_pct: number;
  national: {
    forecast_average_mw: number;
    forecast_peak_mw: number;
    forecast_peak_hour: number;
    forecast_mwh: number;
    calibrated_average_mw: number | null;
    calibrated_peak_mw: number | null;
    calibration_delta_mw: number | null;
    firm_90_average_mw: number | null;
    band80_average_width_mw: number | null;
    hours: number;
  };
  reliability: Reliability;
  cover: {
    share_pct: number;
    confidence: Record<"p80" | "p90" | "stress", CoverSummary | null>;
    definition: string;
  };
  hourly: HourRow[];
  revision: Revision | null;
  outturn: Outturn;
  raw_metrics: Metrics;
  calibrated_metrics: Metrics | null;
  data_quality: DataQuality;
}

export interface DailyRow {
  date: string;
  status: DayStatus;
  k: number | null;
  n: number;
  raw: Metrics;
  calibrated: Metrics | null;
  band80_hits: number | null;
  band80_n: number | null;
  firm90_hits: number | null;
}

export interface ScatterPoint {
  date: string;
  hour: number;
  forecast_mw: number;
  actual_mw: number;
  calibrated_mw: number | null;
  error_mw: number;
  calibrated_error_mw: number | null;
}

export interface HistogramBin {
  from_mw: number;
  to_mw: number;
  raw: number;
  calibrated: number;
}

export interface LevelRow {
  from_mw: number;
  to_mw: number;
  label: string;
  n: number;
  bias_mw: number;
  mae_mw: number;
  calibrated_bias_mw: number | null;
  calibrated_mae_mw: number | null;
  overforecast_share_pct: number;
}

export interface HeatCell {
  date: string;
  hour: number;
  raw_error_mw: number | null;
  calibrated_error_mw: number | null;
}

export interface WorstHour {
  date: string;
  hour: number;
  forecast_mw: number;
  actual_mw: number;
  error_mw: number;
  calibrated_error_mw: number | null;
}

export interface CoverageRow {
  id: string;
  claimed_pct: number | null;
  empirical_pct: number | null;
  hits: number;
  n: number;
  average_width_mw?: number;
}

export interface GateComparison {
  id: GateId;
  label: string;
  short_label: string;
  market: string;
  closure_label: string;
  expected_snapshot: string;
  product: string;
  timezone: string;
  summary: Metrics;
  snapshot_lead_minutes: number;
}

export interface HorizonBucket {
  from_hours: number;
  to_hours: number;
  n: number;
  mae_mw: number;
  bias_mw: number;
}

export interface RevisionStats {
  overall: { n: number; mean_abs_mw: number; p90_abs_mw: number; max_abs_mw: number } | null;
  buckets: Array<{ lead_hours: number; n: number; mean_abs_mw: number; p90_abs_mw: number }>;
  histogram: Array<{ from_mw: number; to_mw: number | null; count: number }>;
  note?: string;
}

export interface AccuracyResponse {
  gate: GateInfo;
  summary: {
    raw: Metrics;
    calibrated: Metrics;
    provisional_days: number;
    calibrated_days: number;
  };
  daily: DailyRow[];
  scatter: ScatterPoint[];
  histogram: { start_mw: number; width_mw: number; bins: HistogramBin[] };
  levels: LevelRow[];
  heatmap: HeatCell[];
  worst: WorstHour[];
  coverage: {
    two_sided: CoverageRow[];
    one_sided: CoverageRow[];
    note: string;
  };
  gates: GateComparison[];
  horizon: { buckets: HorizonBucket[]; note: string };
  revisions: RevisionStats;
  method_notes: string[];
}

export interface SnapshotRow {
  publish_time: string;
  lead_hours_to_midnight: number;
  average_mw: number;
  peak_mw: number;
  revision_mean_abs_mw: number | null;
  revision_max_abs_mw: number | null;
  revision_mean_signed_mw: number | null;
  before_gate: boolean;
  selected: boolean;
  is_latest_before_gate: boolean;
}

export interface SnapshotSeries {
  publish_time: string;
  values: number[];
  selected: boolean;
  before_gate: boolean;
}

export interface SnapshotsResponse {
  delivery_date: string;
  gate: GateInfo;
  selected_snapshot: string | null;
  selected_average_mw: number | null;
  selected_peak_mw: number | null;
  snapshots: SnapshotRow[];
  series: SnapshotSeries[];
  actual: Array<number | null>;
  gates: Array<
    GateInfo & {
      snapshot_time: string | null;
      used_fallback: boolean | null;
      minutes_before_gate: number | null;
    }
  >;
  revision: { day_mean_abs_mw: number | null; month: RevisionStats };
  horizon: { buckets: HorizonBucket[]; note: string };
  status_note: string;
}
