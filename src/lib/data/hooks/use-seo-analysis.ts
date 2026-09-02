// Aba SEO -- fala com a API propria.
//
// Antes lia `seo_analyses` direto no Postgres da Supabase pelo supabase-js, e
// disparava a analise por uma server function guardada por requireSupabaseAuth.
// Os dois caminhos morreram com o projeto da Lovable; agora e /api, com o
// mesmo token do resto do app.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type SeoTargetKeyword = {
  keyword: string;
  intent: string;
  rationale: string;
};

export type SeoAnalysis = {
  id: string;
  competitor_id: string;
  user_id: string;
  source_snapshot_id: string | null;
  model: string;
  score: number | null;
  summary: string | null;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  recommendations: string[];
  target_keywords: SeoTargetKeyword[];
  meta: { domain?: string; url?: string; snapshot_crawled_at?: string };
  analyzed_at: string;
  created_at: string;
  updated_at: string;
};

const KEY = (id: string) => ["seo-analysis", id] as const;

export function useSeoAnalysis(competitorId: string | undefined) {
  return useQuery({
    queryKey: competitorId ? KEY(competitorId) : ["seo-analysis", "noop"],
    enabled: !!competitorId,
    queryFn: async (): Promise<SeoAnalysis | null> => {
      if (!competitorId) return null;
      // A API devolve null (200) quando ainda nao ha analise -- nao 404.
      return await apiFetch<SeoAnalysis | null>(
        `/competitors/${competitorId}/seo`,
      );
    },
  });
}

export function useTriggerSeoAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (competitorId: string) =>
      apiFetch<SeoAnalysis>(`/competitors/${competitorId}/seo`, {
        method: "POST",
      }),
    onSuccess: (analysis, id) => {
      // Atualiza o cache imediatamente para evitar piscar
      qc.setQueryData(KEY(id), analysis);
      qc.invalidateQueries({ queryKey: KEY(id) });
    },
  });
}
