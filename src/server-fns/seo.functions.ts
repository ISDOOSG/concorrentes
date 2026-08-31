import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ competitor_id: z.string().uuid() });

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

export type SeoAnalysisResult =
  | { ok: true; analysis: SeoAnalysis }
  | { ok: false; error: string; status: number };

export const triggerAnalyzeSeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<SeoAnalysisResult> => {
    const { supabase } = context;
    const { data: res, error } = await supabase.functions.invoke(
      "analyze-seo-competitor",
      { body: { competitor_id: data.competitor_id } },
    );

    if (error) {
      // supabase-js põe a Response em error.context — tentar extrair body de erro
      let status = 500;
      let message = error.message ?? "Erro na análise de SEO";
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx === "object" && "status" in ctx) {
        status = (ctx as Response).status ?? 500;
        try {
          const body = await (ctx as Response).clone().json();
          if (body?.error) message = body.error;
        } catch {
          // ignore parse failure
        }
      }
      // Fallback: a função pode ter devolvido `{error}` no `res` mesmo com error
      if (res && typeof res === "object" && "error" in res) {
        message = (res as { error?: string }).error ?? message;
      }
      console.error("[triggerAnalyzeSeo] failed", { status, message });

      // Mensagens amigáveis para casos conhecidos
      if (status === 409) {
        message =
          "Faça um crawl antes de analisar (clique em 'Sincronizar crawl' no topo da página).";
      } else if (status === 429) {
        message =
          "Limite de uso da IA atingido. Tente novamente em alguns minutos.";
      } else if (status === 402) {
        message =
          "Créditos de IA esgotados. Adicione créditos no workspace Lovable.";
      }
      return { ok: false, error: message, status };
    }

    if (!res || typeof res !== "object" || !("ok" in res)) {
      console.error("[triggerAnalyzeSeo] resposta inesperada", res);
      return {
        ok: false,
        error: "Resposta inesperada do servidor de análise.",
        status: 502,
      };
    }
    return res as SeoAnalysisResult;
  });
