import { supabase } from "@/integrations/supabase/client";
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
    const { data, error } = await supabase
      .from("social_snapshots")
      .select(
        "id, competitor_id, platform, handle, fetched_at, fetched_date, followers, following, posts_count, is_verified, is_business, bio, external_url, category, profile_pic_url, recent_posts",
      )
      .eq("competitor_id", competitorId)
      .eq("platform", platform)
      .order("fetched_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data as SnapshotRow[] | null) ?? []).map(rowToSnapshot);
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
    const { data, error } = await supabase
      .from("social_analyses")
      .select(
        "id, competitor_id, platform, source_snapshot_id, model, summary, cadence, format_mix, themes, engagement, top_posts, insights, analyzed_at",
      )
      .eq("competitor_id", competitorId)
      .eq("platform", platform)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToAnalysis(data as AnalysisRow) : null;
  },

  async triggerFetch(
    competitorId: string,
    platform: SocialPlatform = "instagram",
  ): Promise<FetchSocialResult> {
    const { data, error } = await supabase.functions.invoke(
      "fetch-competitor-social",
      { body: { competitor_id: competitorId, platform } },
    );
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status ?? 500;
      const message =
        (data as { error?: string } | null)?.error ?? error.message ?? "Falha ao buscar perfil";
      return { ok: false, error: message, status };
    }
    return data as FetchSocialResult;
  },

  async triggerAnalyze(
    competitorId: string,
    platform: SocialPlatform = "instagram",
  ): Promise<{ ok: true; analysisId: string | null } | { ok: false; error: string; status?: number }> {
    const { data, error } = await supabase.functions.invoke(
      "analyze-social-ig",
      { body: { competitor_id: competitorId, platform } },
    );
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status ?? 500;
      const message =
        (data as { error?: string } | null)?.error ?? error.message ?? "Falha ao analisar perfil";
      return { ok: false, error: message, status };
    }
    const res = data as { ok?: boolean; analysis_id?: string | null; error?: string };
    if (res?.ok) return { ok: true, analysisId: res.analysis_id ?? null };
    return { ok: false, error: res?.error ?? "Resposta inválida da análise" };
  },

  async setInstagramHandle(competitorId: string, handle: string | null): Promise<void> {
    const clean = handle ? handle.trim().replace(/^@/, "").split("?")[0].replace(/\/+$/, "").toLowerCase() : null;
    const { error } = await supabase
      .from("competitors")
      .update({ instagram_handle: clean } as never)
      .eq("id", competitorId);
    if (error) throw error;
  },

  async getInstagramHandles(
    competitorId: string,
  ): Promise<{ handle: string | null; suggestion: string | null; lastFetchedAt: string | null }> {
    const { data, error } = await supabase
      .from("competitors")
      .select("instagram_handle, instagram_handle_suggestion, last_instagram_fetched_at")
      .eq("id", competitorId)
      .maybeSingle();
    if (error || !data) return { handle: null, suggestion: null, lastFetchedAt: null };
    const row = data as unknown as {
      instagram_handle: string | null;
      instagram_handle_suggestion: string | null;
      last_instagram_fetched_at: string | null;
    };
    return {
      handle: row.instagram_handle,
      suggestion: row.instagram_handle_suggestion,
      lastFetchedAt: row.last_instagram_fetched_at,
    };
  },
};
