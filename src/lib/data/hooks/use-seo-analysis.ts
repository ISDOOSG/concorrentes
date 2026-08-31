import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { triggerAnalyzeSeo, type SeoAnalysis } from "@/server-fns/seo.functions";

const KEY = (id: string) => ["seo-analysis", id] as const;

export function useSeoAnalysis(competitorId: string | undefined) {
  return useQuery({
    queryKey: competitorId ? KEY(competitorId) : ["seo-analysis", "noop"],
    enabled: !!competitorId,
    queryFn: async (): Promise<SeoAnalysis | null> => {
      if (!competitorId) return null;
      const { data, error } = await supabase
        .from("seo_analyses")
        .select("*")
        .eq("competitor_id", competitorId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SeoAnalysis) ?? null;
    },
  });
}

export function useTriggerSeoAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (competitorId: string) => {
      const res = await triggerAnalyzeSeo({ data: { competitor_id: competitorId } });
      if (!res.ok) {
        const err = new Error(res.error);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      return res.analysis;
    },
    onSuccess: (analysis, id) => {
      // Atualiza o cache imediatamente para evitar piscar
      qc.setQueryData(KEY(id), analysis);
      qc.invalidateQueries({ queryKey: KEY(id) });
    },
  });
}
