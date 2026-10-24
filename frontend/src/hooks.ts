import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getJson } from "./api";
import type { AccuracyResponse, DeskResponse, GateId, MetaResponse, SnapshotsResponse } from "./types";

const STALE = 5 * 60 * 1000;

export function useMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: ({ signal }) => getJson<MetaResponse>("/api/v1/meta", signal),
    staleTime: STALE,
    retry: 1,
  });
}

export function useDesk(date: string, gate: GateId) {
  return useQuery({
    queryKey: ["desk", date, gate],
    queryFn: ({ signal }) =>
      getJson<DeskResponse>(`/api/v1/desk?date=${date}&gate=${gate}&share=10`, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    retry: 1,
  });
}

export function useAccuracy(gate: GateId) {
  return useQuery({
    queryKey: ["accuracy", gate],
    queryFn: ({ signal }) => getJson<AccuracyResponse>(`/api/v1/accuracy?gate=${gate}`, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    retry: 1,
  });
}

export function useSnapshots(date: string, gate: GateId) {
  return useQuery({
    queryKey: ["snapshots", date, gate],
    queryFn: ({ signal }) =>
      getJson<SnapshotsResponse>(`/api/v1/snapshots?date=${date}&gate=${gate}`, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
    retry: 1,
  });
}
