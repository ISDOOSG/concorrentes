import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { data } from "../index";

const KEYS = {
  one: (id: string) => ["swot", id] as const,
};

export function useSwot(competitorId: string | undefined) {
  return useQuery({
    queryKey: competitorId ? KEYS.one(competitorId) : ["swot", "noop"],
    queryFn: () =>
      competitorId ? data.getSwot(competitorId) : Promise.resolve(null),
    enabled: !!competitorId,
  });
}

export function useGenerateSwot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (competitorId: string) => data.generateSwot(competitorId),
    onSuccess: (_d, competitorId) => {
      qc.invalidateQueries({ queryKey: KEYS.one(competitorId) });
    },
  });
}
