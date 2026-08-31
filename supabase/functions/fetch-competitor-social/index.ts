// Edge function: fetches public Instagram profile + recent posts via ScrapeCreators.
// Falls back to Firecrawl-extracted Instagram handle from competitor's site if
// no manual handle is set.
//
// Body: { competitor_id, user_id?, platform?: 'instagram' }
// Auth: user JWT OR service_role (with user_id)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() =>
    clearTimeout(t),
  );
}

async function resolveInvocation(req: Request) {
  const body = await req.json().catch(() => ({}));
  const competitorId = body?.competitor_id as string | undefined;
  if (!competitorId) {
    return { ok: false as const, status: 400, error: "competitor_id obrigatório" };
  }
  const platform = (body?.platform as string | undefined) ?? "instagram";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token && token === SUPABASE_SERVICE_ROLE_KEY) {
    const userId = body?.user_id as string | undefined;
    if (!userId) return { ok: false as const, status: 400, error: "user_id obrigatório" };
    return { ok: true as const, competitorId, userId, platform };
  }
  if (!token) return { ok: false as const, status: 401, error: "Não autenticado" };

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return { ok: false as const, status: 401, error: "Sessão inválida" };
  return { ok: true as const, competitorId, userId: u.user.id, platform };
}

const IG_BLOCK = new Set([
  "p", "reel", "reels", "explore", "accounts", "stories", "tv",
  "developer", "directory", "about", "legal", "privacy", "terms",
  "session", "login", "signup", "web",
]);

function normalizeIgHandle(raw: string): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/^@/, "");
  // strip URL if any
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    if (u.hostname.includes("instagram.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;
      v = parts[0];
    }
  } catch { /* not a URL, keep as-is */ }
  v = v.split("?")[0].replace(/\/+$/, "");
  if (!v || IG_BLOCK.has(v.toLowerCase())) return null;
  if (!/^[\w.\-]{1,40}$/.test(v)) return null;
  return v.toLowerCase();
}

async function extractHandleFromMarkdown(markdown: string): Promise<string | null> {
  if (!markdown) return null;
  const RE = /instagram\.com\/([\w.\-]+)/gi;
  const counts = new Map<string, number>();
  for (const m of markdown.matchAll(RE)) {
    const h = normalizeIgHandle(m[1]);
    if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function extractHandleViaFirecrawl(
  apiKey: string,
  siteUrl: string,
): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(
      "https://api.firecrawl.dev/v2/scrape",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: siteUrl,
          formats: ["links", "markdown"],
          onlyMainContent: false,
        }),
      },
      30000,
    );
    if (!r.ok) return null;
    const j = await r.json();
    const data = j?.data ?? j;
    const links: string[] = Array.isArray(data?.links) ? data.links : [];
    const md: string = typeof data?.markdown === "string" ? data.markdown : "";
    const counts = new Map<string, number>();
    for (const link of links) {
      const m = /instagram\.com\/([\w.\-]+)/i.exec(link);
      if (m) {
        const h = normalizeIgHandle(m[1]);
        if (h) counts.set(h, (counts.get(h) ?? 0) + 2); // links count more
      }
    }
    for (const m of md.matchAll(/instagram\.com\/([\w.\-]+)/gi)) {
      const h = normalizeIgHandle(m[1]);
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } catch (e) {
    console.warn("[fetch-social] firecrawl extract failed:", e);
    return null;
  }
}

type IgPostNormalized = {
  shortcode: string;
  type: "image" | "video" | "carousel";
  caption: string;
  taken_at: string | null;
  like_count: number;
  comment_count: number;
  video_view_count: number | null;
  thumbnail_url: string | null;
  permalink: string;
};

function normalizeIgProfile(raw: unknown, handle: string) {
  const root = (raw as { data?: { user?: Record<string, unknown> } })?.data?.user
    ?? (raw as { user?: Record<string, unknown> })?.user
    ?? (raw as Record<string, unknown>);
  const u = root as Record<string, unknown>;
  const followers = Number((u?.edge_followed_by as { count?: number })?.count ?? u?.follower_count ?? 0) || 0;
  const following = Number((u?.edge_follow as { count?: number })?.count ?? u?.following_count ?? 0) || 0;
  const postsCount = Number(
    (u?.edge_owner_to_timeline_media as { count?: number })?.count ?? u?.media_count ?? 0,
  ) || 0;

  const edges = ((u?.edge_owner_to_timeline_media as { edges?: Array<{ node?: Record<string, unknown> }> })?.edges) ?? [];
  const recent_posts: IgPostNormalized[] = edges.slice(0, 12).map((edge) => {
    const n = edge.node ?? {};
    const typename = String(n.__typename ?? "");
    let type: IgPostNormalized["type"] = "image";
    if (typename === "GraphVideo" || n.is_video === true || n.product_type === "clips") type = "video";
    if (typename === "GraphSidecar") type = "carousel";

    const captionEdges = (n.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> })?.edges ?? [];
    const caption = captionEdges[0]?.node?.text ?? "";
    const shortcode = String(n.shortcode ?? n.code ?? "");
    const ts = Number(n.taken_at_timestamp ?? n.taken_at ?? 0);

    return {
      shortcode,
      type,
      caption,
      taken_at: ts ? new Date(ts * 1000).toISOString() : null,
      like_count: Number((n.edge_liked_by as { count?: number })?.count ?? (n.edge_media_preview_like as { count?: number })?.count ?? 0) || 0,
      comment_count: Number((n.edge_media_to_comment as { count?: number })?.count ?? 0) || 0,
      video_view_count: type === "video"
        ? Number(n.video_view_count ?? n.video_play_count ?? 0) || 0
        : null,
      thumbnail_url: typeof n.display_url === "string" ? n.display_url
        : typeof n.thumbnail_src === "string" ? n.thumbnail_src
        : null,
      permalink: shortcode ? `https://www.instagram.com/p/${shortcode}/` : "",
    };
  });

  return {
    handle,
    followers,
    following,
    posts_count: postsCount,
    is_verified: Boolean(u?.is_verified),
    is_business: Boolean(u?.is_business_account ?? u?.is_business),
    bio: typeof u?.biography === "string" ? u.biography : null,
    external_url: typeof u?.external_url === "string" ? u.external_url : null,
    category: typeof u?.category_name === "string" ? u.category_name
      : typeof u?.category === "string" ? u.category : null,
    profile_pic_url: typeof u?.profile_pic_url_hd === "string" ? u.profile_pic_url_hd
      : typeof u?.profile_pic_url === "string" ? u.profile_pic_url : null,
    recent_posts,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const inv = await resolveInvocation(req);
    if (!inv.ok) return json({ error: inv.error }, inv.status);
    const { competitorId, userId, platform } = inv;

    if (platform !== "instagram") {
      return json({ error: `Plataforma ${platform} ainda não suportada` }, 400);
    }

    const { data: comp, error: compErr } = await admin
      .from("competitors")
      .select("id, name, url, user_id, instagram_handle, instagram_handle_suggestion, last_instagram_fetched_at")
      .eq("id", competitorId)
      .eq("user_id", userId)
      .maybeSingle();
    if (compErr || !comp) return json({ error: "Concorrente não encontrado" }, 404);

    // Throttle: 1h
    if (comp.last_instagram_fetched_at) {
      const ageMs = Date.now() - new Date(comp.last_instagram_fetched_at).getTime();
      if (ageMs < 60 * 60 * 1000) {
        return json({
          ok: true,
          throttled: true,
          notes: ["Snapshot recente (<1h). Use o último ou aguarde."],
        });
      }
    }

    // Resolve handle: manual → suggestion → snapshot markdown → Firecrawl
    let handle = normalizeIgHandle(comp.instagram_handle ?? "")
      ?? normalizeIgHandle(comp.instagram_handle_suggestion ?? "");
    const notes: string[] = [];
    let source = "manual";

    if (!handle) {
      // Try latest snapshot markdown
      const { data: snap } = await admin
        .from("snapshots")
        .select("raw_text")
        .eq("competitor_id", competitorId)
        .order("crawled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snap?.raw_text) {
        handle = await extractHandleFromMarkdown(snap.raw_text);
        if (handle) { source = "snapshot"; notes.push(`Handle @${handle} detectado no último crawl`); }
      }
    }

    if (!handle) {
      const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
      if (fcKey && comp.url) {
        handle = await extractHandleViaFirecrawl(fcKey, comp.url);
        if (handle) { source = "firecrawl"; notes.push(`Handle @${handle} detectado via Firecrawl`); }
      }
    }

    if (!handle) {
      return json({
        ok: false,
        error: "Não foi possível identificar o @ do Instagram. Informe manualmente.",
        notes,
      }, 422);
    }

    // Persist suggestion if it came from auto-detection
    if (source !== "manual" && (comp.instagram_handle_suggestion ?? "") !== handle) {
      await admin
        .from("competitors")
        .update({ instagram_handle_suggestion: handle })
        .eq("id", competitorId);
    }

    // Get ScrapeCreators key
    const { data: scKey } = await admin.rpc("get_scraper_key", {
      _user_id: userId,
      _provider: "scrapecreators",
    });
    if (typeof scKey !== "string" || !scKey) {
      return json({
        ok: false,
        error: "Configure sua chave do ScrapeCreators em Configurações para coletar dados de redes sociais.",
        notes,
      }, 400);
    }

    // Fetch profile (1 credit, includes 12 posts)
    const url = `https://api.scrapecreators.com/v1/instagram/profile?handle=${encodeURIComponent(handle)}&trim=true`;
    const r = await fetchWithTimeout(url, { headers: { "x-api-key": scKey } }, 30000);
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[fetch-social] scrapecreators error", r.status, t.slice(0, 200));
      return json({
        ok: false,
        error: `ScrapeCreators retornou ${r.status}. ${t.slice(0, 160)}`,
        notes,
      }, 502);
    }
    const raw = await r.json();
    const norm = normalizeIgProfile(raw, handle);

    // Get prev for delta
    const { data: prev } = await admin
      .from("social_snapshots")
      .select("followers, fetched_at")
      .eq("competitor_id", competitorId)
      .eq("platform", "instagram")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const followersDelta = prev?.followers != null ? norm.followers - prev.followers : null;

    // Upsert daily
    const today = new Date().toISOString().slice(0, 10);
    const { data: upserted, error: upErr } = await admin
      .from("social_snapshots")
      .upsert({
        user_id: userId,
        competitor_id: competitorId,
        platform: "instagram",
        handle: norm.handle,
        fetched_at: new Date().toISOString(),
        fetched_date: today,
        followers: norm.followers,
        following: norm.following,
        posts_count: norm.posts_count,
        is_verified: norm.is_verified,
        is_business: norm.is_business,
        bio: norm.bio,
        external_url: norm.external_url,
        category: norm.category,
        profile_pic_url: norm.profile_pic_url,
        recent_posts: norm.recent_posts,
        raw,
        cost_credits: 1,
      }, { onConflict: "competitor_id,platform,fetched_date" })
      .select("id")
      .single();
    if (upErr) {
      console.error("[fetch-social] upsert error", upErr);
      return json({ ok: false, error: upErr.message, notes }, 500);
    }

    await admin
      .from("competitors")
      .update({ last_instagram_fetched_at: new Date().toISOString() })
      .eq("id", competitorId);

    console.log(`[fetch-social] ig handle=${handle} src=${source} → ${norm.recent_posts.length} posts, ${norm.followers} followers (Δ ${followersDelta ?? "n/a"})`);

    return json({
      ok: true,
      snapshot_id: upserted?.id ?? null,
      handle,
      source,
      followers: norm.followers,
      followers_delta: followersDelta,
      posts_returned: norm.recent_posts.length,
      notes,
    });
  } catch (e) {
    console.error("[fetch-social] fatal", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
