// Supabase-backed DataProvider.
// Uses Lovable-applied schema (profiles, competitors, alerts, swot_reports,
// user_llm_settings/keys, user_scraper_keys). Operations that depend on
// edge functions Lovable hasn't shipped yet (crawl-competitor,
// generate-swot, save-llm-key) throw a clear error.

import { supabase } from "@/integrations/supabase/client";
import {
  getConnectorStatus,
  testConnectorConnection,
} from "@/server-fns/integrations.functions";
import type {
  Competitor,
  Alert,
  Swot,
  Ad,
  AdSource,
  Snapshot,
  SnapshotStructuredData,
  AdsLinkSuggestion,
} from "@/lib/ic-mock";
import type {
  CreateCompetitorInput,
  DataProvider,
  LLMProviderId,
  LLMSettings,
  LLMUseCase,
  ScraperKeyInfo,
  ScraperKeySource,
  ScraperProviderId,
  ScraperTestResult,
} from "../types";

// O supabase-js embrulha respostas non-2xx como FunctionsHttpError com a
// mensagem genérica "Edge Function returned a non-2xx status code". A causa
// real vem no corpo JSON da Response em `error.context`.
export async function edgeErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.clone === "function") {
    try {
      const body = (await ctx.clone().json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // corpo não-JSON — cai no fallback abaixo
    }
  }
  const msg = (error as Error | undefined)?.message;
  return msg && !msg.startsWith("Edge Function returned") ? msg : fallback;
}

// ----- Adapters -----

const PALETTE = [
  "var(--via-util-1)",
  "var(--via-util-2)",
  "var(--via-util-3)",
  "var(--via-util-4)",
  "var(--via-util-5)",
  "var(--via-util-6)",
];

export function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function domainOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

type CompetitorRow = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  status: string;
  last_crawled_at: string | null;
  created_at: string;
  crawl_status?: string | null;
  crawl_error?: string | null;
  crawl_started_at?: string | null;
};

export function normalizeCrawlStatus(s: string | null | undefined): Competitor["crawlStatus"] {
  if (s === "queued" || s === "running" || s === "success" || s === "failed") return s;
  return "never";
}

export function adaptCompetitor(row: CompetitorRow): Competitor {
  const crawlStatus = normalizeCrawlStatus(row.crawl_status);
  const lastChange = row.last_crawled_at
    ? new Date(row.last_crawled_at).toLocaleDateString("pt-BR")
    : crawlStatus === "queued"
      ? "Na fila"
      : crawlStatus === "running"
        ? "Crawleando…"
        : crawlStatus === "failed"
          ? "Falhou"
          : "Aguardando crawl";
  return {
    id: row.id,
    name: row.name,
    domain: domainOf(row.url),
    category: "—",
    color: hashColor(row.id),
    favicon: (row.name[0] ?? "?").toUpperCase(),
    monitoring: row.status === "active",
    traffic: 0,
    trafficDelta: 0,
    seoKeywords: 0,
    seoDelta: 0,
    pricingTier: "—",
    lastChange,
    changeType: "content",
    changeSummary:
      crawlStatus === "failed" && row.crawl_error
        ? row.crawl_error
        : "Aguardando primeiro crawl",
    changeSeverity: crawlStatus === "failed" ? "high" : "low",
    description: "Cadastrado por você. Aguardando crawl inicial.",
    health: 0,
    trafficSeries: [0, 0, 0, 0, 0, 0, 0],
    keywordsTop: [],
    crawlStatus,
    crawlError: row.crawl_error ?? null,
    crawlStartedAt: row.crawl_started_at ?? null,
  };
}

type AlertWithChangeRow = {
  id: string;
  channel: string;
  read_at: string | null;
  created_at: string;
  change: {
    competitor_id: string;
    severity: "high" | "medium" | "low" | "info";
    summary: string | null;
    change_type: "pricing" | "feature" | "copy" | "design" | "content" | string;
  } | null;
};

// O banco usa severity in (info, warning, critical) e change_type in
// (price, copy, feature, design, traffic); o front usa (low, medium, high)
// e (pricing, copy, feature, design, content). Mapeamento explícito — o
// cast cru deixava "critical" passar como valor inválido e o contador de
// alertas críticos ficava sempre em zero.
const SEVERITY_FROM_DB: Record<string, Alert["severity"]> = {
  info: "low",
  warning: "medium",
  critical: "high",
};

const CHANGE_TYPE_FROM_DB: Record<string, Alert["type"]> = {
  price: "pricing",
  copy: "copy",
  feature: "feature",
  design: "design",
  traffic: "content",
};

export function adaptAlert(row: AlertWithChangeRow): Alert {
  const c = row.change;
  return {
    id: row.id,
    competitor: c?.competitor_id ?? "",
    severity: SEVERITY_FROM_DB[c?.severity ?? ""] ?? "low",
    type: CHANGE_TYPE_FROM_DB[c?.change_type ?? ""] ?? "content",
    title: c?.summary ?? "Mudança detectada",
    detail: row.read_at ? "Lido" : "Novo",
    time: timeAgo(row.created_at),
    source: row.channel,
    confidence: 90,
  };
}

type SnapshotRow = {
  id: string;
  competitor_id: string;
  crawled_at: string;
  source: string;
  content_hash: string | null;
  raw_text: string | null;
  structured_data: unknown;
  screenshot_path: string | null;
  cost_cents: number | null;
};

export function adaptSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    competitor_id: row.competitor_id,
    crawled_at: row.crawled_at,
    source: row.source,
    content_hash: row.content_hash,
    raw_text: row.raw_text,
    structured_data:
      (row.structured_data as SnapshotStructuredData | null) ?? null,
    screenshot_path: row.screenshot_path,
    cost_cents: row.cost_cents,
  };
}

type AdRow = {
  id: string;
  competitor_id: string;
  source: string;
  ad_archive_id: string;
  active: boolean | null;
  body_text: string | null;
  cta_text: string | null;
  cta_url: string | null;
  page_name: string | null;
  creatives: unknown;
  targeting: unknown;
  spend_estimate: unknown;
  start_date: string | null;
  end_date: string | null;
  platforms: string[] | null;
  fetched_at: string;
};

export function adaptAd(row: AdRow): Ad {
  return {
    id: row.id,
    competitor: row.competitor_id,
    source: (row.source === "google" ? "google" : "meta") as AdSource,
    ad_archive_id: row.ad_archive_id,
    active: typeof row.active === "boolean" ? row.active : null,
    body_text: row.body_text ?? "",
    cta_text: row.cta_text,
    cta_url: row.cta_url,
    page_name: row.page_name,
    creatives: Array.isArray(row.creatives) ? (row.creatives as Ad["creatives"]) : [],
    targeting: (row.targeting as Ad["targeting"]) ?? null,
    spend_estimate: (row.spend_estimate as Ad["spend_estimate"]) ?? null,
    start_date: row.start_date,
    end_date: row.end_date,
    platforms: row.platforms ?? [],
    fetched_at: row.fetched_at,
  };
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `Há ${m || 1} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Há ${h}h`;
  const d = Math.floor(h / 24);
  return `Há ${d}d`;
}

async function getUserIdOrThrow(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  return user.id;
}

// ----- Provider -----

export const supabaseProvider: DataProvider = {
  // ----- Competitors -----
  async listCompetitors(): Promise<Competitor[]> {
    const { data, error } = await supabase
      .from("competitors")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(adaptCompetitor);
  },

  async getCompetitor(id: string): Promise<Competitor | null> {
    const { data, error } = await supabase
      .from("competitors")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? adaptCompetitor(data) : null;
  },

  async createCompetitor({
    name,
    url,
  }: CreateCompetitorInput): Promise<Competitor> {
    const userId = await getUserIdOrThrow();
    const cleanedUrl = url.startsWith("http") ? url : `https://${url}`;
    const finalName = name.trim() || domainOf(cleanedUrl);
    const { data, error } = await supabase
      .from("competitors")
      .insert({
        user_id: userId,
        name: finalName,
        url: cleanedUrl,
        status: "active",
      })
      .select("*")
      .single();
    if (error) throw error;
    return adaptCompetitor(data);
  },

  async toggleCompetitorStatus(id: string): Promise<Competitor> {
    const { data: row, error: e1 } = await supabase
      .from("competitors")
      .select("status")
      .eq("id", id)
      .single();
    if (e1) throw e1;
    const newStatus = row.status === "active" ? "paused" : "active";
    const { data, error } = await supabase
      .from("competitors")
      .update({ status: newStatus })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return adaptCompetitor(data);
  },

  async deleteCompetitor(id: string): Promise<void> {
    const { error } = await supabase
      .from("competitors")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async triggerCrawl(id: string): Promise<{ ok: true; queuedAt: string }> {
    const { error } = await supabase.functions.invoke(
      "crawl-competitor",
      { body: { competitor_id: id } },
    );
    if (error) {
      throw new Error(
        await edgeErrorMessage(error, "Falha ao disparar crawl"),
      );
    }
    return { ok: true, queuedAt: new Date().toISOString() };
  },

  // ----- Alerts -----
  async listAlerts(): Promise<Alert[]> {
    const { data, error } = await supabase
      .from("alerts")
      .select(
        "id, channel, read_at, created_at, change:changes(competitor_id, severity, summary, change_type)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => adaptAlert(r as AlertWithChangeRow));
  },

  async markAlertRead(id: string): Promise<void> {
    const { error } = await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  // ----- SWOT -----
  async getSwot(competitorId: string): Promise<Swot> {
    const { data, error } = await supabase
      .from("swot_reports")
      .select("strengths, weaknesses, opportunities, threats")
      .eq("competitor_id", competitorId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: [],
      };
    }
    return data as unknown as Swot;
  },

  async generateSwot(competitorId: string): Promise<Swot> {
    const { data, error } = await supabase.functions.invoke("generate-swot", {
      body: { competitor_id: competitorId },
    });
    if (error) {
      throw new Error(
        await edgeErrorMessage(error, "Falha ao gerar a análise SWOT"),
      );
    }
    return data as Swot;
  },

  // ----- LLM settings -----
  async getLlmSettings(): Promise<LLMSettings> {
    const userId = await getUserIdOrThrow();
    const [{ data: settings }, { data: keys }] = await Promise.all([
      supabase
        .from("user_llm_settings")
        .select("provider, model_classification, model_swot")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_llm_keys")
        .select("provider, key_hint, created_at")
        .eq("user_id", userId),
    ]);
    const provider = (settings?.provider ?? "lovable") as LLMProviderId;
    const hasKeyByProvider: LLMSettings["hasKeyByProvider"] = {};
    for (const k of keys ?? []) {
      const p = k.provider as LLMProviderId;
      if (p === "lovable") continue;
      hasKeyByProvider[p] = {
        keyHint: k.key_hint ?? "",
        createdAt: k.created_at,
      };
    }
    return {
      provider,
      modelClassification: settings?.model_classification ?? null,
      modelSwot: settings?.model_swot ?? null,
      hasKeyByProvider,
    };
  },

  async setLlmProvider(provider: LLMProviderId): Promise<LLMSettings> {
    const userId = await getUserIdOrThrow();
    const { error } = await supabase
      .from("user_llm_settings")
      .upsert(
        { user_id: userId, provider, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return supabaseProvider.getLlmSettings();
  },

  async setLlmModel(
    useCase: LLMUseCase,
    modelId: string | null,
  ): Promise<LLMSettings> {
    const userId = await getUserIdOrThrow();
    const patch =
      useCase === "classification"
        ? { model_classification: modelId }
        : { model_swot: modelId };
    const { error } = await supabase
      .from("user_llm_settings")
      .upsert(
        {
          user_id: userId,
          ...patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return supabaseProvider.getLlmSettings();
  },

  async saveLlmKey(provider: LLMProviderId, key: string): Promise<LLMSettings> {
    const { data, error } = await supabase.functions.invoke("save-llm-key", {
      body: { provider, key },
    });
    if (error) {
      throw new Error(
        await edgeErrorMessage(error, "Falha ao salvar a chave LLM"),
      );
    }
    return data as LLMSettings;
  },

  async deleteLlmKey(provider: LLMProviderId): Promise<LLMSettings> {
    if (provider === "lovable") return supabaseProvider.getLlmSettings();
    const userId = await getUserIdOrThrow();
    const { error } = await supabase
      .from("user_llm_keys")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);
    if (error) throw error;
    return supabaseProvider.getLlmSettings();
  },

  // ----- Scraper keys (BYOK) — already implemented by Lovable -----
  async listScraperKeys(): Promise<ScraperKeyInfo[]> {
    const providers: ScraperProviderId[] = ["firecrawl", "scrapecreators"];

    // Roda em paralelo: chaves manuais (BYOK) + connectors via Lovable
    const [keysRes, connectorStatus] = await Promise.all([
      supabase
        .from("user_scraper_keys")
        .select("provider, key_hint, source, updated_at"),
      // se a server function falhar (ex.: usuário deslogado, rede), assumimos
      // nenhum connector configurado — não bloqueia a tela
      getConnectorStatus().catch(
        () =>
          ({
            firecrawl: false,
            scrapecreators: false,
          }) as Record<ScraperProviderId, boolean>,
      ),
    ]);

    if (keysRes.error) throw keysRes.error;

    const byProv = new Map(
      (keysRes.data ?? []).map((r) => [
        r.provider as ScraperProviderId,
        r as {
          provider: string;
          key_hint: string | null;
          source: string;
          updated_at: string;
        },
      ]),
    );

    return providers.map((p) => {
      const r = byProv.get(p);
      // Prioriza chave manual (BYOK) — usuário a cadastrou explicitamente
      if (r) {
        return {
          provider: p,
          configured: true,
          keyHint: r.key_hint ?? null,
          source: (r.source as ScraperKeySource | undefined) ?? null,
          updatedAt: r.updated_at ?? null,
        };
      }
      // Sem chave manual mas o connector Lovable está disponível no servidor
      if (connectorStatus[p]) {
        return {
          provider: p,
          configured: true,
          keyHint: null,
          source: "lovable_connector" as const,
          updatedAt: null,
        };
      }
      return {
        provider: p,
        configured: false,
        keyHint: null,
        source: null,
        updatedAt: null,
      };
    });
  },

  async saveScraperKey(
    provider: ScraperProviderId,
    key: string,
    source: ScraperKeySource = "manual",
  ): Promise<ScraperKeyInfo> {
    const trimmed = key.trim();
    if (!trimmed || trimmed.length < 8) throw new Error("Chave inválida");
    const { error } = await supabase.rpc("set_scraper_key", {
      _provider: provider,
      _plain: trimmed,
      _source: source,
    });
    if (error) throw error;
    return {
      provider,
      configured: true,
      keyHint: trimmed.slice(-4),
      source,
      updatedAt: new Date().toISOString(),
    };
  },

  async deleteScraperKey(provider: ScraperProviderId): Promise<void> {
    const { error } = await supabase
      .from("user_scraper_keys")
      .delete()
      .eq("provider", provider);
    if (error) throw error;
  },

  async testScraperKey(
    provider: ScraperProviderId,
    keyOverride?: string,
  ): Promise<ScraperTestResult> {
    // Sem override: descobre se a chave válida é manual (BYOK na DB) ou
    // veio do connector Lovable (env var no servidor TanStack)
    if (!keyOverride) {
      const { data: row, error: rowErr } = await supabase
        .from("user_scraper_keys")
        .select("provider")
        .eq("provider", provider)
        .maybeSingle();
      if (rowErr) {
        return {
          ok: false,
          error: rowErr.message ?? "Falha ao consultar a chave",
        };
      }
      // Sem chave manual → tenta validar via connector Lovable
      if (!row) {
        try {
          const res = await testConnectorConnection({ data: { provider } });
          return res;
        } catch (e) {
          return {
            ok: false,
            error: (e as Error).message ?? "Falha ao testar via Lovable",
          };
        }
      }
    }

    // Caso manual (com ou sem override): usa a Edge Function Supabase
    const { data: result, error } = await supabase.functions.invoke(
      "test-scraper-key",
      {
        body: {
          provider,
          ...(keyOverride ? { key: keyOverride } : {}),
        },
      },
    );
    if (error) {
      return { ok: false, error: error.message ?? "Falha ao testar a chave" };
    }
    return result as ScraperTestResult;
  },

  // ----- Snapshots (resultado de cada crawl Firecrawl) -----
  async getLatestSnapshot(competitorId: string): Promise<Snapshot | null> {
    try {
      const { data, error } = await supabase
        .from("snapshots")
        .select(
          "id, competitor_id, crawled_at, source, content_hash, raw_text, structured_data, screenshot_path, cost_cents",
        )
        .eq("competitor_id", competitorId)
        .order("crawled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data ? adaptSnapshot(data as unknown as SnapshotRow) : null;
    } catch {
      return null;
    }
  },

  async listSnapshots(
    competitorId: string,
    limit: number = 20,
  ): Promise<Snapshot[]> {
    try {
      const { data, error } = await supabase
        .from("snapshots")
        .select(
          "id, competitor_id, crawled_at, source, content_hash, raw_text, structured_data, screenshot_path, cost_cents",
        )
        .eq("competitor_id", competitorId)
        .order("crawled_at", { ascending: false })
        .limit(limit);
      if (error) return [];
      return ((data ?? []) as unknown as SnapshotRow[]).map(adaptSnapshot);
    } catch {
      return [];
    }
  },

  // ----- Ads (Meta + Google via ScrapeCreators) -----
  // ads_snapshots e Edge Function fetch-competitor-ads serão entregues
  // pelo Lovable conforme docs/lovable-ads-monitoring-prompt.md.
  // Enquanto não chegam, listAds tenta select graceful e fetchAds avisa.
  async listAds(competitorId: string): Promise<Ad[]> {
    try {
      // ads_snapshots ainda não existe no banco — esse select vai falhar
      // até o Lovable aplicar a migration. Em caso de erro, retornamos []
      // (empty state limpo no frontend).
      const { data, error } = await supabase
        .from("ads_snapshots" as never)
        .select(
          "id, competitor_id, source, ad_archive_id, active, body_text, cta_text, cta_url, page_name, creatives, targeting, spend_estimate, start_date, end_date, platforms, fetched_at",
        )
        .eq("competitor_id", competitorId)
        .order("fetched_at", { ascending: false })
        .limit(100);
      if (error) return [];
      return ((data ?? []) as unknown as AdRow[]).map(adaptAd);
    } catch {
      return [];
    }
  },

  async triggerFetchAds(
    id: string,
    options?: { withDetails?: boolean },
  ) {
    const { data, error } = await supabase.functions.invoke(
      "fetch-competitor-ads",
      {
        body: {
          competitor_id: id,
          with_details: options?.withDetails === true,
        },
      },
    );
    if (error) {
      const status =
        (error as { context?: { status?: number } }).context?.status ?? 500;
      const msg =
        (data as { error?: string } | null)?.error ??
        error.message ??
        "Falha ao buscar ads";
      void status;
      throw new Error(msg);
    }
    const res = (data ?? {}) as {
      meta_count?: number;
      google_count?: number;
      notes?: string[];
      sources?: { meta?: string; google?: string };
      with_details?: boolean;
    };
    return {
      ok: true as const,
      queuedAt: new Date().toISOString(),
      metaCount: res.meta_count,
      googleCount: res.google_count,
      notes: res.notes ?? [],
      sources: res.sources,
      withDetails: res.with_details,
    };
  },

  async linkCompetitorAds(
    competitorId: string,
    input: {
      facebookPageId?: string | null;
      googleAdvertiserId?: string | null;
    },
  ): Promise<void> {
    const patch: Record<string, string | null> = {};
    if (input.facebookPageId !== undefined)
      patch.facebook_page_id = input.facebookPageId;
    if (input.googleAdvertiserId !== undefined)
      patch.google_advertiser_id = input.googleAdvertiserId;
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase
      .from("competitors")
      .update(patch as never)
      .eq("id", competitorId);
    if (error) throw error;
  },

  async triggerSuggestAdsLinks(
    competitorId: string,
  ): Promise<AdsLinkSuggestion | null> {
    const { error } = await supabase.functions.invoke("suggest-ads-links", {
      body: { competitor_id: competitorId },
    });
    if (error) {
      const status =
        (error as { context?: { status?: number } }).context?.status ?? 500;
      if (status === 429) {
        throw new Error(
          "Sugestão recente em cache (válida por 24h). Tente novamente em algumas horas.",
        );
      }
      throw new Error(
        error.message ?? "Falha ao gerar sugestões de vínculo de ads",
      );
    }
    // Lê o resultado persistido logo em seguida (single source of truth = banco)
    return supabaseProvider.getAdsLinkSuggestion(competitorId);
  },

  // Sugestões automáticas (preenchidas pela Edge Function suggest-ads-links).
  // Lê colunas adicionadas em migration 0013. Graceful fallback se ainda
  // não estiverem populadas.
  async getAdsLinkSuggestion(
    competitorId: string,
  ): Promise<AdsLinkSuggestion | null> {
    try {
      const { data, error } = await supabase
        .from("competitors")
        .select(
          "facebook_page_suggestion, google_advertiser_suggestion, ads_link_confidence, ads_link_reasoning, ads_link_suggested_at",
        )
        .eq("id", competitorId)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as unknown as {
        facebook_page_suggestion: string | null;
        google_advertiser_suggestion: string | null;
        ads_link_confidence: { meta?: number; google?: number } | null;
        ads_link_reasoning: string | null;
        ads_link_suggested_at: string | null;
      };
      if (!row.ads_link_suggested_at) return null;
      return {
        facebookPageId: row.facebook_page_suggestion ?? null,
        googleAdvertiserId: row.google_advertiser_suggestion ?? null,
        confidence: {
          meta: row.ads_link_confidence?.meta ?? 0,
          google: row.ads_link_confidence?.google ?? 0,
        },
        reasoning: row.ads_link_reasoning ?? null,
        suggestedAt: row.ads_link_suggested_at,
      };
    } catch {
      return null;
    }
  },
};
