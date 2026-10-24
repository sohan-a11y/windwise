import { describe, expect, it } from "vitest";

import type { HourRow } from "../types";
import { coverForHour, summariseCover } from "./cover";

function row(hour: number, forecast: number | null, firm: number | null): HourRow {
  return {
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    forecast_mw: forecast,
    calibrated_mw: forecast,
    band80_low_mw: null,
    band80_high_mw: null,
    band95_low_mw: null,
    band95_high_mw: null,
    firm_mw: { p80: firm, p90: firm, stress: firm },
    forecast_share_mw: null,
    cover_mw: { p80: null, p90: null, stress: null },
    actual_mw: null,
    error_mw: null,
    calibrated_error_mw: null,
    shortfall_mw: null,
  };
}

describe("coverForHour", () => {
  it("sizes cover as share × (forecast − firm wind)", () => {
    expect(coverForHour(row(0, 12_000, 8_000), 10, "p90")).toBe(400);
  });

  it("floors at zero when firm wind exceeds the forecast", () => {
    expect(coverForHour(row(0, 5_000, 8_000), 10, "p90")).toBe(0);
  });

  it("returns null when the hour cannot be priced", () => {
    expect(coverForHour(row(0, null, 8_000), 10, "p90")).toBeNull();
    expect(coverForHour(row(0, 12_000, null), 10, "p90")).toBeNull();
  });

  it("clamps the share and rounds MW to whole units", () => {
    expect(coverForHour(row(0, 12_000, 8_000), 0, "p90")).toBe(0);
    expect(coverForHour(row(0, 12_000, 8_000), 200, "p90")).toBe(4_000);
    expect(coverForHour(row(0, 12_001, 8_000), 10, "p90")).toBe(400);
  });
});

describe("summariseCover", () => {
  it("totals the hourly book, including zero-cover hours", () => {
    const rows = [row(0, 10_000, 8_000), row(1, 9_000, 8_000), row(2, 7_000, 8_000)];
    expect(summariseCover(rows, 10, "p90")).toEqual({
      peakMw: 200,
      peakHour: 0,
      averageMw: 100,
      mwh: 300,
      hoursPositive: 2,
    });
  });

  it("returns null when no hour has a forecast and firm level", () => {
    expect(summariseCover([row(0, null, null)], 10, "p90")).toBeNull();
    expect(summariseCover([], 10, "p90")).toBeNull();
  });
});
