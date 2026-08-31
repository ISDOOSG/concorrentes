import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { data } from "../index";

const KEYS = {
  byCompetitor: (id: string) => ["ads", id] as const,
  suggestion: (id: string) => ["ads-link-suggestion", id] as const,
};

export function useAdsLinkSuggestion(competitorId: string | undefined) {
  return useQuery({
    queryKey: competitorId
      ? KEYS.suggestion(competitorId)
      : ["ads-link-suggestion", "noop"],
    queryFn: () =>
      competitorId
        ? data.getAdsLinkSuggestion(competitorId)
        : Promise.resolve(null),
    enabled: !!competitorId,
  });
}

export function useTriggerSuggestAdsLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (competitorId: string) =>
      data.triggerSuggestAdsLinks(competitorId),
    onSuccess: (_d, competitorId) => {
      qc.invalidateQueries({ queryKey: KEYS.suggestion(competitorId) });
    },
  });
}

export function useAds(competitorId: string | undefined) {
  return useQuery({
    queryKey: competitorId
      ? KEYS.byCompetitor(competitorId)
      : ["ads", "noop"],
    queryFn: () =>
      competitorId ? data.listAds(competitorId) : Promise.resolve([]),
    enabled: !!competitorId,
  });
}

export function useFetchAds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { competitorId: string; withDetails?: boolean }) => {
      const competitorId = typeof input === "string" ? input : input.competitorId;
      const withDetails = typeof input === "string" ? false : input.withDetails === true;
      return data.triggerFetchAds(competitorId, { withDetails });
    },
    onSuccess: (_d, input) => {
      const competitorId = typeof input === "string" ? input : input.competitorId;
      qc.invalidateQueries({ queryKey: KEYS.byCompetitor(competitorId) });
      qc.invalidateQueries({ queryKey: ["competitors"] });
    },
  });
}

export function useLinkCompetitorAds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      competitorId: string;
      facebookPageId?: string | null;
      googleAdvertiserId?: string | null;
    }) =>
      data.linkCompetitorAds(input.competitorId, {
        facebookPageId: input.facebookPageId,
        googleAdvertiserId: input.googleAdvertiserId,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["competitors"] });
      qc.invalidateQueries({ queryKey: KEYS.byCompetitor(vars.competitorId) });
    },
  });
}
