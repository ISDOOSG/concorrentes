// DataProvider contra a API propria (FastAPI, porta 8012) -- substitui o
// providers/supabase.ts. Reaproveita os adaptadores de linha->dominio de
// adapters.ts (extraidos de la): minha API devolve as
// mesmas colunas que o supabase-js devolvia, entao o mesmo mapeamento vale.
import { apiFetch } from "@/lib/api-client";
import {
  adaptAd,
  adaptAlert,
  adaptCompetitor,
  adaptSnapshot,
} from "./adapters";
import type {
  Ad,
  Alert,
  Competitor,
  Snapshot,
  Swot,
  AdsLinkSuggestion,
} from "@/lib/ic-mock";
import type {
  CreateCompetitorInput,
  DataProvider,
  LLMProviderId,
  LLMSettings,
  LLMUseCase,
  ScraperKeyInfo,
  ScraperProviderId,
  ScraperTestResult,
} from "../types";

export const apiProvider: DataProvider = {
  // ----- Competitors -----
  async listCompetitors(): Promise<Competitor[]> {
    const rows = await apiFetch<unknown[]>("/competitors");
    return rows.map((r) => adaptCompetitor(r as Parameters<typeof adaptCompetitor>[0]));
  },

  async getCompetitor(id: string): Promise<Competitor | null> {
    try {
      const row = await apiFetch<unknown>(`/competitors/${id}`);
      return adaptCompetitor(row as Parameters<typeof adaptCompetitor>[0]);
    } catch {
      return null;
    }
  },

  async createCompetitor(input: CreateCompetitorInput): Promise<Competitor> {
    const row = await apiFetch<unknown>("/competitors", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return adaptCompetitor(row as Parameters<typeof adaptCompetitor>[0]);
  },

  async toggleCompetitorStatus(id: string): Promise<Competitor> {
    const row = await apiFetch<unknown>(`/competitors/${id}/status`, {
      method: "PATCH",
    });
    return adaptCompetitor(row as Parameters<typeof adaptCompetitor>[0]);
  },

  async deleteCompetitor(id: string): Promise<void> {
    await apiFetch(`/competitors/${id}`, { method: "DELETE" });
  },

  async triggerCrawl(id: string): Promise<{ ok: true; queuedAt: string }> {
    return apiFetch(`/competitors/${id}/crawl`, { method: "POST" });
  },

  // ----- Alerts -----
  async listAlerts(): Promise<Alert[]> {
    const rows = await apiFetch<unknown[]>("/alerts");
    return rows.map((r) => adaptAlert(r as Parameters<typeof adaptAlert>[0]));
  },

  async markAlertRead(id: string): Promise<void> {
    await apiFetch(`/alerts/${id}/read`, { method: "POST" });
  },

  // ----- SWOT -----
  async getSwot(competitorId: string): Promise<Swot> {
    try {
      const row = await apiFetch<Swot>(`/competitors/${competitorId}/swot`);
      return row;
    } catch {
      return { strengths: [], weaknesses: [], opportunities: [], threats: [] };
    }
  },

  async generateSwot(competitorId: string): Promise<Swot> {
    return apiFetch(`/competitors/${competitorId}/swot`, { method: "POST" });
  },

  // ----- LLM settings -----
  async getLlmSettings(): Promise<LLMSettings> {
    return apiFetch("/llm/settings");
  },

  async setLlmProvider(provider: LLMProviderId): Promise<LLMSettings> {
    return apiFetch("/llm/provider", {
      method: "PUT",
      body: JSON.stringify({ provider }),
    });
  },

  async setLlmModel(
    useCase: LLMUseCase,
    modelId: string | null,
  ): Promise<LLMSettings> {
    return apiFetch("/llm/model", {
      method: "PUT",
      body: JSON.stringify({ useCase, modelId }),
    });
  },

  async saveLlmKey(provider: LLMProviderId, key: string): Promise<LLMSettings> {
    return apiFetch("/llm/keys", {
      method: "POST",
      body: JSON.stringify({ provider, key }),
    });
  },

  async deleteLlmKey(provider: LLMProviderId): Promise<LLMSettings> {
    return apiFetch(`/llm/keys/${provider}`, { method: "DELETE" });
  },

  // ----- Scraper keys (BYOK) -----
  async listScraperKeys(): Promise<ScraperKeyInfo[]> {
    const rows = await apiFetch<
      { provider: ScraperProviderId; key_hint: string | null; source: string; updated_at: string }[]
    >("/scraper-keys");
    const byProv = new Map(rows.map((r) => [r.provider, r]));
    const providers: ScraperProviderId[] = ["firecrawl", "scrapecreators"];
    return providers.map((p) => {
      const r = byProv.get(p);
      if (!r) {
        return { provider: p, configured: false, keyHint: null, source: null, updatedAt: null };
      }
      return {
        provider: p,
        configured: true,
        keyHint: r.key_hint,
        source: r.source as ScraperKeyInfo["source"],
        updatedAt: r.updated_at,
      };
    });
  },

  async saveScraperKey(
    provider: ScraperProviderId,
    key: string,
    source = "manual",
  ): Promise<ScraperKeyInfo> {
    const trimmed = key.trim();
    if (!trimmed || trimmed.length < 8) throw new Error("Chave inválida");
    const r = await apiFetch<{ provider: ScraperProviderId; key_hint: string; source: string; updated_at: string }>(
      "/scraper-keys",
      { method: "POST", body: JSON.stringify({ provider, key: trimmed, source }) },
    );
    return {
      provider: r.provider,
      configured: true,
      keyHint: r.key_hint,
      source: r.source as ScraperKeyInfo["source"],
      updatedAt: r.updated_at,
    };
  },

  async deleteScraperKey(provider: ScraperProviderId): Promise<void> {
    await apiFetch(`/scraper-keys/${provider}`, { method: "DELETE" });
  },

  async testScraperKey(
    provider: ScraperProviderId,
    keyOverride?: string,
  ): Promise<ScraperTestResult> {
    try {
      return await apiFetch(`/scraper-keys/${provider}/test`, {
        method: "POST",
        body: JSON.stringify(keyOverride ? { key: keyOverride } : {}),
      });
    } catch (e) {
      return { ok: false, error: (e as Error).message ?? "Falha ao testar a chave" };
    }
  },

  // ----- Snapshots -----
  async getLatestSnapshot(competitorId: string): Promise<Snapshot | null> {
    try {
      const row = await apiFetch<unknown>(`/competitors/${competitorId}/snapshots/latest`);
      return row ? adaptSnapshot(row as Parameters<typeof adaptSnapshot>[0]) : null;
    } catch {
      return null;
    }
  },

  async listSnapshots(competitorId: string, limit = 20): Promise<Snapshot[]> {
    try {
      const rows = await apiFetch<unknown[]>(
        `/competitors/${competitorId}/snapshots?limit=${limit}`,
      );
      return rows.map((r) => adaptSnapshot(r as Parameters<typeof adaptSnapshot>[0]));
    } catch {
      return [];
    }
  },

  // ----- Ads -----
  async listAds(competitorId: string): Promise<Ad[]> {
    try {
      const rows = await apiFetch<unknown[]>(`/competitors/${competitorId}/ads`);
      return rows.map((r) => adaptAd(r as Parameters<typeof adaptAd>[0]));
    } catch {
      return [];
    }
  },

  async triggerFetchAds(id: string, options?: { withDetails?: boolean }) {
    return apiFetch(`/competitors/${id}/ads/fetch`, {
      method: "POST",
      body: JSON.stringify({ with_details: options?.withDetails === true }),
    });
  },

  async linkCompetitorAds(
    competitorId: string,
    input: { facebookPageId?: string | null; googleAdvertiserId?: string | null },
  ): Promise<void> {
    await apiFetch(`/competitors/${competitorId}/ads-link`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async getAdsLinkSuggestion(competitorId: string): Promise<AdsLinkSuggestion | null> {
    try {
      const row = await apiFetch<{
        facebook_page_suggestion: string | null;
        google_advertiser_suggestion: string | null;
        ads_link_confidence: { meta?: number; google?: number } | null;
        ads_link_reasoning: string | null;
        ads_link_suggested_at: string | null;
      }>(`/competitors/${competitorId}/ads-suggestion`);
      if (!row?.ads_link_suggested_at) return null;
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

  async triggerSuggestAdsLinks(competitorId: string): Promise<AdsLinkSuggestion | null> {
    await apiFetch(`/competitors/${competitorId}/ads-suggestion`, { method: "POST" });
    return apiProvider.getAdsLinkSuggestion(competitorId);
  },
};
