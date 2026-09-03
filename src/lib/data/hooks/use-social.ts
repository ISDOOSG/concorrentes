import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { data } from "@/lib/data";
import type { SocialPlatform } from "@/lib/social/types";

const KEYS = {
  snapshots: (id: string, p: SocialPlatform) => ["social-snapshots", id, p] as const,
  latest: (id: string, p: SocialPlatform) => ["social-latest", id, p] as const,
  analysis: (id: string, p: SocialPlatform) => ["social-analysis", id, p] as const,
  handles: (id: string) => ["social-handles", id] as const,
};

export function useLatestSocialSnapshot(competitorId: string | undefined, platform: SocialPlatform = "instagram") {
  return useQuery({
    queryKey: competitorId ? KEYS.latest(competitorId, platform) : ["social-latest", "noop"],
    queryFn: () => (competitorId ? data.getLatestSocialSnapshot(competitorId, platform) : Promise.resolve(null)),
    enabled: !!competitorId,
  });
}

export function useSocialAnalysis(competitorId: string | undefined, platform: SocialPlatform = "instagram") {
  return useQuery({
    queryKey: competitorId ? KEYS.analysis(competitorId, platform) : ["social-analysis", "noop"],
    queryFn: () => (competitorId ? data.getSocialAnalysis(competitorId, platform) : Promise.resolve(null)),
    enabled: !!competitorId,
  });
}

export function useInstagramHandles(competitorId: string | undefined) {
  return useQuery({
    queryKey: competitorId ? KEYS.handles(competitorId) : ["social-handles", "noop"],
    queryFn: () =>
      competitorId
        ? data.getInstagramHandles(competitorId)
        : Promise.resolve({ handle: null, suggestion: null, lastFetchedAt: null }),
    enabled: !!competitorId,
  });
}

export function useFetchSocial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { competitorId: string; platform?: SocialPlatform }) =>
      data.fetchSocial(input.competitorId, input.platform ?? "instagram"),
    onSuccess: (_d, vars) => {
      const p = vars.platform ?? "instagram";
      qc.invalidateQueries({ queryKey: KEYS.snapshots(vars.competitorId, p) });
      qc.invalidateQueries({ queryKey: KEYS.latest(vars.competitorId, p) });
      qc.invalidateQueries({ queryKey: KEYS.handles(vars.competitorId) });
    },
  });
}

export function useAnalyzeSocial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { competitorId: string; platform?: SocialPlatform }) =>
      data.analyzeSocial(input.competitorId, input.platform ?? "instagram"),
    onSuccess: (_d, vars) => {
      const p = vars.platform ?? "instagram";
      qc.invalidateQueries({ queryKey: KEYS.analysis(vars.competitorId, p) });
    },
  });
}

export function useSetInstagramHandle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { competitorId: string; handle: string | null }) =>
      data.setInstagramHandle(input.competitorId, input.handle),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.handles(vars.competitorId) });
    },
  });
}
