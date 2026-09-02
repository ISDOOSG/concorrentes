// Aba Social -- fala com a API propria.
//
// Antes lia social_snapshots/social_analyses direto no Postgres da
// Supabase e disparava as edge functions fetch-competitor-social e
// analyze-social-ig. O projeto da Lovable nao existe mais; agora e /api.
// Os adaptadores abaixo nao mudaram: a API devolve as mesmas colunas.
import { ApiError, apiFetch } from "@/lib/api-client";
import type {
  FetchSocialResult,
  SocialAnalysis,
  SocialPlatform,
  SocialSnapshot,
} from "@/lib/social/types";

type SnapshotRow = {
  id: string;
  competitor_id: string;
  platform: string;
  handle: string;
  fetched_at: string;
  fetched_date: string;
  followers: number | null;
  following: number | null;
  posts_count: number | null;
  is_verified: boolean | null;
  is_business: boolean | null;
  bio: string | null;
  external_url: string | null;
  category: string | null;
  profile_pic_url: string | null;
  recent_posts: unknown;
};

function rowToSnapshot(r: SnapshotRow): SocialSnapshot {
  return {
    id: r.id,
    competitorId: r.competitor_id,
    platform: (r.platform as SocialPlatform) ?? "instagram",
    handle: r.handle,
    fetchedAt: r.fetched_at,
    fetchedDate: r.fetched_date,
    followers: r.followers,
    following: r.following,
    postsCount: r.posts_count,
    isVerified: r.is_verified,
    isBusiness: r.is_business,
    bio: r.bio,
    externalUrl: r.external_url,
    category: r.category,
    profilePicUrl: r.profile_pic_url,
    recentPosts: Array.isArray(r.recent_posts) ? (r.recent_posts as SocialSnapshot["recentPosts"]) : [],
  };
}

type AnalysisRow = {
  id: string;
  competitor_id: string;
  platform: string;
  source_snapshot_id: string | null;
  model: string;
  summary: string | null;
  cadence: unknown;
  format_mix: unknown;
  themes: unknown;
  engagement: unknown;
  top_posts: unknown;
  insights: unknown;
  analyzed_at: string;
};

function rowToAnalysis(r: AnalysisRow): SocialAnalysis {
  return {
    id: r.id,
    competitorId: r.competitor_id,
    platform: (r.platform as SocialPlatform) ?? "instagram",
    sourceSnapshotId: r.source_snapshot_id,
    model: r.model,
    summary: r.summary,
    cadence: (r.cadence as SocialAnalysis["cadence"]) ?? { posts_per_week: 0, best_weekday: "", notes: "" },
    formatMix: (r.format_mix as SocialAnalysis["formatMix"]) ?? { reel_pct: 0, image_pct: 0, carousel_pct: 0 },
    themes: Array.isArray(r.themes) ? (r.themes as SocialAnalysis["themes"]) : [],
    engagement: (r.engagement as SocialAnalysis["engagement"]) ?? { avg_likes: 0, avg_comments: 0, engagement_rate_pct: 0 },
    topPosts: Array.isArray(r.top_posts) ? (r.top_posts as SocialAnalysis["topPosts"]) : [],
    insights: Array.isArray(r.insights) ? (r.insights as string[]) : [],
    analyzedAt: r.analyzed_at,
  };
}

export const socialApi = {
  async listSnapshots(
    competitorId: string,
    platform: SocialPlatform = "instagram",
    limit = 30,
  ): Promise<SocialSnapshot[]> {
    const rows = await apiFetch<SnapshotRow[]>(
      `/competitors/${competitorId}/social/snapshots?platform=${platform}&limit=${limit}`,
    );
    return (rows ?? []).map(rowToSnapshot);
  },

  async getLatestSnapshot(
    competitorId: string,
    platform: SocialPlatform = "instagram",
  ): Promise<SocialSnapshot | null> {
    const list = await this.listSnapshots(competitorId, platform, 1);
    return list[0] ?? null;
  },

  async getLatestAnalysis(
    competitorId: string,
    platform: SocialPlatform = "instagram",
  ): Promise<SocialAnalysis | null> {
    // A API devolve null (200) quando ainda nao ha analise -- nao 404.
    const row = await apiFetch<AnalysisRow | null>(
      `/competitors/${competitorId}/social/analysis?platform=${platform}`,
    );
    return row ? rowToAnalysis(row) : null;
  },

  async triggerFetch(
    competitorId: string,
    platform: SocialPlatform = "instagram",
  ): Promise<FetchSocialResult> {
    // Continua 501 ate a chave do ScrapeCreators existir. O erro vem com a
    // mensagem da API, que diz de qual servico depende.
    try {
      return await apiFetch<FetchSocialResult>(
        `/competitors/${competitorId}/social/fetch?platform=${platform}`,
        { method: "POST" },
      );
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, error: err.message ?? "Falha ao buscar perfil", status: err.status ?? 500 };
    }
  },

  async triggerAnalyze(
    competitorId: string,
    platform: SocialPlatform = "instagram",
  ): Promise<{ ok: true; analysisId: string | null } | { ok: false; error: string; status?: number }> {
    try {
      const row = await apiFetch<AnalysisRow>(
        `/competitors/${competitorId}/social/analyze?platform=${platform}`,
        { method: "POST" },
      );
      return { ok: true, analysisId: row?.id ?? null };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, error: err.message ?? "Falha ao analisar perfil", status: err.status };
    }
  },

  async setInstagramHandle(competitorId: string, handle: string | null): Promise<void> {
    // A limpeza do handle (trim, @, querystring, barra final) passou a ser
    // feita no servidor -- um consumidor futuro da API nao pode depender de
    // cada front repetir a regra.
    await apiFetch<void>(`/competitors/${competitorId}/instagram-handle`, {
      method: "PATCH",
      body: JSON.stringify({ handle }),
    });
  },

  async getInstagramHandles(
    competitorId: string,
  ): Promise<{ handle: string | null; suggestion: string | null; lastFetchedAt: string | null }> {
    try {
      const row = await apiFetch<{
        instagram_handle: string | null;
        instagram_handle_suggestion: string | null;
        last_instagram_fetched_at: string | null;
      }>(`/competitors/${competitorId}/instagram-handle`);
      return {
        handle: row.instagram_handle,
        suggestion: row.instagram_handle_suggestion,
        lastFetchedAt: row.last_instagram_fetched_at,
      };
    } catch {
      return { handle: null, suggestion: null, lastFetchedAt: null };
    }
  },
};
