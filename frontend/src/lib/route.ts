import { useEffect, useRef, useState } from "react";
import { clamp } from "./format";
import type { GateId, View } from "../types";

export interface Route {
  view: View;
  date: string;
  gate: GateId;
  share: number;
}

export const DEFAULT_ROUTE: Route = {
  view: "desk",
  date: "2026-01-31",
  gate: "n2ex",
  share: 10,
};

const VIEWS: View[] = ["desk", "accuracy", "snapshots", "method"];
const GATES: GateId[] = ["n2ex", "epex", "epex_hh"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOW_START = "2026-01-01";
const WINDOW_END = "2026-01-31";

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const viewParam = params.get("view");
  const gateParam = params.get("gate");
  const dateParam = params.get("date");
  const shareParam = Number(params.get("share"));

  const view = VIEWS.includes(viewParam as View) ? (viewParam as View) : DEFAULT_ROUTE.view;
  const gate = GATES.includes(gateParam as GateId) ? (gateParam as GateId) : DEFAULT_ROUTE.gate;
  const date =
    dateParam && ISO_DATE.test(dateParam) && dateParam >= WINDOW_START && dateParam <= WINDOW_END
      ? dateParam
      : DEFAULT_ROUTE.date;
  const share =
    Number.isFinite(shareParam) && shareParam > 0
      ? clamp(shareParam, 0.5, 100)
      : DEFAULT_ROUTE.share;

  return { view, date, gate, share };
}

export function routeToSearch(route: Route): string {
  const params = new URLSearchParams();
  params.set("view", route.view);
  params.set("date", route.date);
  params.set("gate", route.gate);
  params.set("share", String(Number(route.share.toFixed(1))));
  return `?${params.toString()}`;
}

export interface NavigateOptions {
  replace?: boolean;
  scroll?: boolean;
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(typeof window === "undefined" ? "" : window.location.search),
  );
  const routeRef = useRef(route);

  useEffect(() => {
    const onPopState = () => {
      const next = parseRoute(window.location.search);
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Keep the initial URL canonical (adds missing keys without adding history).
  useEffect(() => {
    const canonical = routeToSearch(routeRef.current);
    if (window.location.search !== canonical) {
      window.history.replaceState(null, "", canonical);
    }
  }, []);

  function navigate(patch: Partial<Route>, options: NavigateOptions = {}) {
    const current = routeRef.current;
    const next = { ...current, ...patch };
    const nextSearch = routeToSearch(next);
    if (nextSearch !== routeToSearch(current)) {
      if (options.replace) {
        window.history.replaceState(null, "", nextSearch);
      } else {
        window.history.pushState(null, "", nextSearch);
      }
    }
    routeRef.current = next;
    setRoute(next);
    if (options.scroll !== false) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return { route, navigate };
}
