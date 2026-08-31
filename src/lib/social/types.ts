// Domain types for the social media analysis layer (Instagram only for now).

export type SocialPlatform = "instagram";

export type SocialPostType = "image" | "video" | "carousel";

export type SocialPost = {
  shortcode: string;
  type: SocialPostType;
  caption: string;
  taken_at: string | null;
  like_count: number;
  comment_count: number;
  video_view_count: number | null;
  thumbnail_url: string | null;
  permalink: string;
};

export type SocialSnapshot = {
  id: string;
  competitorId: string;
  platform: SocialPlatform;
  handle: string;
  fetchedAt: string;
  fetchedDate: string;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
  isVerified: boolean | null;
  isBusiness: boolean | null;
  bio: string | null;
  externalUrl: string | null;
  category: string | null;
  profilePicUrl: string | null;
  recentPosts: SocialPost[];
};

export type SocialAnalysis = {
  id: string;
  competitorId: string;
  platform: SocialPlatform;
  sourceSnapshotId: string | null;
  model: string;
  summary: string | null;
  cadence: { posts_per_week: number; best_weekday: string; notes: string };
  formatMix: { reel_pct: number; image_pct: number; carousel_pct: number };
  themes: Array<{ label: string; weight: number }>;
  engagement: { avg_likes: number; avg_comments: number; engagement_rate_pct: number };
  topPosts: Array<{ shortcode: string; permalink: string; reason: string }>;
  insights: string[];
  analyzedAt: string;
};

export type FetchSocialResult =
  | {
      ok: true;
      handle: string;
      source: "manual" | "snapshot" | "firecrawl";
      followers: number;
      followers_delta: number | null;
      posts_returned: number;
      throttled?: boolean;
      notes?: string[];
    }
  | { ok: false; error: string; status?: number; notes?: string[] };
