import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  competitor_id: z.string().uuid(),
  with_details: z.boolean().optional(),
});

export type FetchAdsResult =
  | {
      ok: true;
      meta_count: number;
      google_count: number;
      with_details?: boolean;
      sources?: { meta?: string; google?: string };
      notes?: string[];
    }
  | { ok: false; error: string; status: number; notes?: string[] };

export const triggerFetchCompetitorAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<FetchAdsResult> => {
    const { supabase } = context;
    const { data: res, error } = await supabase.functions.invoke(
      "fetch-competitor-ads",
      {
        body: {
          competitor_id: data.competitor_id,
          with_details: data.with_details === true,
        },
      },
    );
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status ?? 500;
      const message = (res as { error?: string } | null)?.error ?? error.message ?? "Erro ao buscar ads";
      return { ok: false, error: message, status };
    }
    return res as FetchAdsResult;
  });
