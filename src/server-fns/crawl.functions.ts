import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ competitor_id: z.string().uuid() });

export type CrawlResult =
  | { ok: true; snapshot_id: string; source: "firecrawl" }
  | { ok: false; error: string; status: number };

export const triggerCrawlCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<CrawlResult> => {
    const { supabase } = context;
    const { data: res, error } = await supabase.functions.invoke(
      "crawl-competitor",
      { body: { competitor_id: data.competitor_id } },
    );
    if (error) {
      // supabase-js wraps non-2xx as FunctionsHttpError; surface message + status
      const status = (error as { context?: { status?: number } }).context?.status ?? 500;
      const message = (res as { error?: string } | null)?.error ?? error.message ?? "Erro no crawl";
      return { ok: false, error: message, status };
    }
    return res as CrawlResult;
  });
