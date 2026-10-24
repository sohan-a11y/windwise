import { describe, expect, it } from "vitest";

import { DEFAULT_ROUTE, parseRoute, routeToSearch } from "./route";

describe("parseRoute", () => {
  it("falls back to the desk defaults when the URL is empty", () => {
    expect(parseRoute("")).toEqual(DEFAULT_ROUTE);
    expect(DEFAULT_ROUTE).toMatchObject({
      view: "desk",
      date: "2026-01-31",
      gate: "n2ex",
      share: 10,
    });
  });

  it("reads a fully specified route", () => {
    expect(parseRoute("?view=accuracy&date=2026-01-15&gate=epex_hh&share=12.5")).toEqual({
      view: "accuracy",
      date: "2026-01-15",
      gate: "epex_hh",
      share: 12.5,
    });
  });

  it("rejects unknown views and gates", () => {
    const route = parseRoute("?view=admin&gate=belpex");
    expect(route.view).toBe("desk");
    expect(route.gate).toBe("n2ex");
  });

  it("keeps dates inside the January 2026 delivery window", () => {
    expect(parseRoute("?date=2025-12-31").date).toBe("2026-01-31");
    expect(parseRoute("?date=2026-02-01").date).toBe("2026-01-31");
    expect(parseRoute("?date=2026-1-4").date).toBe("2026-01-31");
    expect(parseRoute("?date=2026-01-04").date).toBe("2026-01-04");
  });

  it("clamps the procurement share to a sensible range", () => {
    expect(parseRoute("?share=0.1").share).toBe(0.5);
    expect(parseRoute("?share=240").share).toBe(100);
    expect(parseRoute("?share=not-a-number").share).toBe(10);
  });
});

describe("routeToSearch", () => {
  it("round-trips a canonical route", () => {
    const route = parseRoute("?view=snapshots&date=2026-01-16&gate=epex&share=35");
    expect(parseRoute(routeToSearch(route))).toEqual(route);
  });

  it("normalises share precision and order", () => {
    expect(
      routeToSearch({ view: "method", date: "2026-01-02", gate: "n2ex", share: 7.06 }),
    ).toBe("?view=method&date=2026-01-02&gate=n2ex&share=7.1");
  });
});
