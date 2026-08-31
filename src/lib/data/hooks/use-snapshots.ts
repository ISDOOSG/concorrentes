import { useQuery } from "@tanstack/react-query";

import { data } from "../index";

const KEYS = {
  latest: (id: string) => ["snapshot:latest", id] as const,
  list: (id: string, limit: number) => ["snapshot:list", id, limit] as const,
};

export function useLatestSnapshot(competitorId: string | undefined) {
  return useQuery({
    queryKey: competitorId
      ? KEYS.latest(competitorId)
      : ["snapshot:latest", "noop"],
    queryFn: () =>
      competitorId
        ? data.getLatestSnapshot(competitorId)
        : Promise.resolve(null),
    enabled: !!competitorId,
  });
}

export function useSnapshots(
  competitorId: string | undefined,
  limit: number = 20,
) {
  return useQuery({
    queryKey: competitorId
      ? KEYS.list(competitorId, limit)
      : ["snapshot:list", "noop"],
    queryFn: () =>
      competitorId ? data.listSnapshots(competitorId, limit) : Promise.resolve([]),
    enabled: !!competitorId,
  });
}
