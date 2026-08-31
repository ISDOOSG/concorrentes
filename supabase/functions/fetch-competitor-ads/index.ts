// Edge function: fetches Meta + Google ads for a competitor via ScrapeCreators
// and upserts snapshots into ads_snapshots.
//
// Invocation modes:
//  A) Trigger / scheduler (service_role): body { competitor_id, user_id, with_details? }
//  B) Client (user JWT):                  body { competitor_id, with_details? }
//
// Google Ads fallback strategy:
//  1. If google_advertiser_id matches ^AR\d+$ → use ?advertiser_id=
//  2. Else, if competitor.url has a usable domain → use ?domain= (no extra cost)
//  3. Else, skip Google
//
// Note on credits (ScrapeCreators policy after 2025-11-10):
//  - /v1/google/company/ads default = 1 credit, returns only advertiserId+creativeId.
//  - With ?get_ad_details=true → 25 credits, returns full creative payload.
//  - We default get_ad_details to false. Pass with_details=true to enable.

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
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function ptErrorFromStatus(status: number, raw: string): string {
  if (status === 401 || status === 403) return "Chave ScrapeCreators inválida ou expirada";
  if (status === 402) return "Créditos ScrapeCreators esgotados";
  if (status === 429) return "Limite de requisições atingido — tente em alguns minutos";
  return `ScrapeCreators ${status}: ${raw.slice(0, 200)}`;
}

const ADVERTISER_ID_RE = /^AR\d+$/;

function extractDomainFromUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    if (!host || !host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

async function resolveInvocation(req: Request): Promise<
  | { ok: true; competitorId: string; userId: string; withDetails: boolean }
  | { ok: false; status: number; error: string }
> {
  const body = await req.json().catch(() => ({}));
  const competitorId = body?.competitor_id as string | undefined;
  const withDetails = body?.with_details === true;
  if (!competitorId) {
    return { ok: false, status: 400, error: "competitor_id obrigatório" };
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token && token === SUPABASE_SERVICE_ROLE_KEY) {
    const userId = body?.user_id as string | undefined;
    if (!userId) return { ok: false, status: 400, error: "user_id obrigatório" };
    return { ok: true, competitorId, userId, withDetails };
  }

  if (!token) return { ok: false, status: 401, error: "Não autenticado" };
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return { ok: false, status: 401, error: "Sessão inválida" };
  }
  const { data: comp, error: compErr } = await userClient
    .from("competitors")
    .select("id")
    .eq("id", competitorId)
    .maybeSingle();
  if (compErr || !comp) {
    return { ok: false, status: 404, error: "Concorrente não encontrado" };
  }
  return { ok: true, competitorId, userId: userRes.user.id, withDetails };
}

type NormalizedAd = {
  ad_archive_id: string;
  active: boolean | null;
  body_text: string | null;
  cta_text: string | null;
  cta_url: string | null;
  page_name: string | null;
  creatives: unknown;
  targeting: unknown;
  spend_estimate: unknown;
  impressions_estimate: unknown;
  start_date: string | null;
  end_date: string | null;
  platforms: string[] | null;
  raw: unknown;
};

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.length > 0) return v;
  return null;
}
function pickBool(...vals: unknown[]): boolean | null {
  for (const v of vals) if (typeof v === "boolean") return v;
  return null;
}
function isoOrNull(v: unknown): string | null {
  if (typeof v === "string" && v) return v;
  if (typeof v === "number" && v > 0) {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  return null;
}

function normalizeMetaAd(raw: any): NormalizedAd | null {
  const id = pickStr(raw?.ad_archive_id, raw?.adArchiveID, raw?.id);
  if (!id) return null;
  const snap = raw?.snapshot ?? raw;
  const cards = snap?.cards ?? [];
  const creatives: any[] = [];
  if (snap?.images && Array.isArray(snap.images)) {
    for (const img of snap.images) {
      creatives.push({ type: "image", url: img?.original_image_url ?? img?.url, thumbnail: img?.resized_image_url });
    }
  }
  if (snap?.videos && Array.isArray(snap.videos)) {
    for (const v of snap.videos) {
      creatives.push({ type: "video", url: v?.video_hd_url ?? v?.video_sd_url, thumbnail: v?.video_preview_image_url });
    }
  }
  for (const c of cards) {
    if (c?.video_hd_url || c?.video_sd_url)
      creatives.push({ type: "video", url: c.video_hd_url ?? c.video_sd_url, thumbnail: c?.video_preview_image_url });
    else if (c?.original_image_url)
      creatives.push({ type: "image", url: c.original_image_url, thumbnail: c?.resized_image_url });
  }
  return {
    ad_archive_id: id,
    active: pickBool(raw?.is_active, raw?.isActive),
    body_text: pickStr(snap?.body?.text, snap?.body, raw?.ad_creative_bodies?.[0]),
    cta_text: pickStr(snap?.cta_text, snap?.cta?.text, cards?.[0]?.cta_text),
    cta_url: pickStr(snap?.link_url, snap?.cta?.url, cards?.[0]?.link_url),
    page_name: pickStr(snap?.page_name, raw?.page_name),
    creatives: creatives.length ? creatives : null,
    targeting: raw?.targeting ?? raw?.target_locations ?? null,
    spend_estimate: raw?.spend ?? raw?.spend_estimate ?? null,
    impressions_estimate: raw?.impressions ?? raw?.impressions_estimate ?? null,
    start_date: isoOrNull(raw?.start_date ?? raw?.start_date_string ?? raw?.startDate),
    end_date: isoOrNull(raw?.end_date ?? raw?.end_date_string ?? raw?.endDate),
    platforms: Array.isArray(raw?.publisher_platform) ? raw.publisher_platform : (raw?.platforms ?? null),
    raw,
  };
}

// New ScrapeCreators Google Ad Library schema (post 2025-11-10):
//   { advertiserId, creativeId, format, adUrl, advertiserName, domain,
//     imageUrl, firstShown, lastShown }
// With get_ad_details=true the response also includes richer creative fields.
function normalizeGoogleAd(raw: any): NormalizedAd | null {
  // Prefer creativeId (unique per ad); fall back to legacy fields just in case.
  const id = pickStr(
    raw?.creativeId,
    raw?.creative_id,
    raw?.ad_id,
    raw?.adId,
    raw?.id,
  );
  if (!id) return null;

  const advertiserId = pickStr(raw?.advertiserId, raw?.advertiser_id);
  const advertiserName = pickStr(raw?.advertiserName, raw?.advertiser_name, raw?.advertiser);
  const format = (raw?.format ?? raw?.creative_format ?? "").toString().toLowerCase();
  const isVideo = format.includes("video");
  const creatives: any[] = [];
  const mediaUrl = pickStr(
    raw?.imageUrl,
    raw?.image_url,
    raw?.videoUrl,
    raw?.video_url,
    raw?.preview_url,
    raw?.creative_url,
  );
  if (mediaUrl) {
    creatives.push({
      type: isVideo ? "video" : "image",
      url: mediaUrl,
      thumbnail: pickStr(raw?.thumbnail_url, raw?.imageUrl),
    });
  }
  // Build a fallback Transparency URL if the API didn't include one.
  const adUrl =
    pickStr(raw?.adUrl, raw?.ad_url) ??
    (advertiserId
      ? `https://adstransparency.google.com/advertiser/${advertiserId}/creative/${id}?region=anywhere`
      : null);

  // Friendlier label for the basic search (1 cr.) where there's no ad copy.
  const friendlyText =
    pickStr(raw?.text, raw?.body, raw?.description, raw?.ad_text) ??
    (format && advertiserName
      ? `Criativo ${format} · ${advertiserName}`
      : format
        ? `Criativo ${format}`
        : advertiserName
          ? `Anúncio · ${advertiserName}`
          : null);

  return {
    ad_archive_id: id,
    // Google basic API doesn't return an active flag — leave null so UI shows "Veiculando".
    active: pickBool(raw?.is_active, raw?.active),
    body_text: friendlyText,
    cta_text: pickStr(raw?.cta, raw?.cta_text),
    cta_url: pickStr(raw?.destination_url, raw?.url, raw?.click_url) ?? adUrl,
    page_name: advertiserName,
    creatives: creatives.length ? creatives : null,
    targeting: raw?.targeting ?? raw?.regions ?? null,
    spend_estimate: null,
    impressions_estimate: raw?.impressions ?? null,
    start_date: isoOrNull(raw?.firstShown ?? raw?.first_shown ?? raw?.start_date),
    end_date: isoOrNull(raw?.lastShown ?? raw?.last_shown ?? raw?.end_date),
    platforms: ["google"],
    raw: { ...raw, format: format || raw?.format },
  };
}

async function fetchMetaAds(apiKey: string, fbPageId: string): Promise<any[]> {
  const url = `https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads?company_id=${encodeURIComponent(fbPageId)}`;
  console.log(`[fetch-ads] meta page=${fbPageId} → GET ${url}`);
  const res = await fetchWithTimeout(url, { headers: { "x-api-key": apiKey } }, 60_000);
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    console.log(`[fetch-ads] meta error status=${res.status} body=${raw.slice(0, 200)}`);
    throw new Error(ptErrorFromStatus(res.status, raw));
  }
  const data = await res.json();
  const ads = Array.isArray(data) ? data : (data?.ads ?? data?.results ?? data?.data ?? []);
  console.log(`[fetch-ads] meta page=${fbPageId} → ${ads.length} ads`);
  return ads;
}

async function fetchGoogleAds(
  apiKey: string,
  params: { advertiserId?: string | null; domain?: string | null },
  withDetails: boolean,
): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params.advertiserId) qs.set("advertiser_id", params.advertiserId);
  else if (params.domain) qs.set("domain", params.domain);
  else return [];
  if (withDetails) qs.set("get_ad_details", "true");
  const url = `https://api.scrapecreators.com/v1/google/company/ads?${qs.toString()}`;
  const label = params.advertiserId ? `advertiser_id=${params.advertiserId}` : `domain=${params.domain}`;
  console.log(`[fetch-ads] google ${label} with_details=${withDetails} → GET ${url}`);
  const res = await fetchWithTimeout(url, { headers: { "x-api-key": apiKey } }, 60_000);
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    console.log(`[fetch-ads] google error status=${res.status} body=${raw.slice(0, 200)}`);
    throw new Error(ptErrorFromStatus(res.status, raw));
  }
  const data = await res.json();
  const ads = Array.isArray(data) ? data : (data?.ads ?? data?.results ?? data?.data ?? []);
  console.log(`[fetch-ads] google ${label} → ${ads.length} ads`);
  return ads;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405);

  const inv = await resolveInvocation(req);
  if (!inv.ok) return json({ ok: false, error: inv.error }, inv.status);
  const { competitorId, userId, withDetails } = inv;

  const { data: comp, error: compErr } = await admin
    .from("competitors")
    .select("id, user_id, url, facebook_page_id, google_advertiser_id")
    .eq("id", competitorId)
    .maybeSingle();
  if (compErr || !comp) return json({ ok: false, error: "Concorrente não encontrado" }, 404);

  const fbId = (comp.facebook_page_id as string | null) || null;
  const rawGoogleId = (comp.google_advertiser_id as string | null) || null;
  const validGoogleId = rawGoogleId && ADVERTISER_ID_RE.test(rawGoogleId.trim())
    ? rawGoogleId.trim()
    : null;
  const siteDomain = extractDomainFromUrl(comp.url as string | null);

  const willTryGoogle = !!(validGoogleId || siteDomain);
  const willTryMeta = !!fbId;

  if (!willTryMeta && !willTryGoogle) {
    return json(
      {
        ok: false,
        error:
          "Sem fonte para buscar ads: vincule a Facebook Page (ou cadastre o site para fallback Google por domínio).",
      },
      400,
    );
  }

  const { data: scKey } = await admin.rpc("get_scraper_key", {
    _user_id: userId,
    _provider: "scrapecreators",
  });
  if (!scKey) {
    return json(
      { ok: false, error: "Configure sua chave ScrapeCreators em /settings/integrations" },
      400,
    );
  }
  const apiKey = scKey as string;

  let metaCount = 0;
  let googleCount = 0;
  const notes: string[] = [];
  const sources: { meta?: string; google?: string } = {};

  try {
    if (willTryMeta && fbId) {
      sources.meta = `facebook_page_id=${fbId}`;
      const ads = await fetchMetaAds(apiKey, fbId);
      const rows = ads
        .map((a) => normalizeMetaAd(a))
        .filter((a): a is NormalizedAd => !!a)
        .map((a) => ({
          user_id: userId,
          competitor_id: competitorId,
          source: "meta" as const,
          ...a,
        }));
      if (rows.length > 0) {
        const { error } = await admin
          .from("ads_snapshots")
          .upsert(rows, {
            onConflict: "competitor_id,source,ad_archive_id,fetched_date",
            ignoreDuplicates: false,
          });
        if (error) throw new Error(`Erro ao salvar Meta ads: ${error.message}`);
        metaCount = rows.length;
      } else {
        notes.push(`Nenhum anúncio ativo encontrado no Meta para a Page ${fbId}.`);
      }
    }

    if (willTryGoogle) {
      const usedAdvertiser = !!validGoogleId;
      sources.google = usedAdvertiser
        ? `advertiser_id=${validGoogleId}`
        : `domain=${siteDomain}`;
      if (!usedAdvertiser && rawGoogleId && !validGoogleId) {
        notes.push(
          `Google Advertiser ID inválido ("${rawGoogleId.slice(0, 40)}"). Usando fallback por domínio "${siteDomain}". Cole a URL /advertiser/AR… para resultados mais precisos.`,
        );
      } else if (!usedAdvertiser) {
        notes.push(
          `Buscando ads do Google pelo domínio do site (${siteDomain}). Cole a URL /advertiser/AR… para precisão maior.`,
        );
      }
      const ads = await fetchGoogleAds(
        apiKey,
        { advertiserId: validGoogleId, domain: siteDomain },
        withDetails,
      );
      const rows = ads
        .map((a) => normalizeGoogleAd(a))
        .filter((a): a is NormalizedAd => !!a)
        .map((a) => ({
          user_id: userId,
          competitor_id: competitorId,
          source: "google" as const,
          ...a,
        }));
      if (rows.length > 0) {
        const { error } = await admin
          .from("ads_snapshots")
          .upsert(rows, {
            onConflict: "competitor_id,source,ad_archive_id,fetched_date",
            ignoreDuplicates: false,
          });
        if (error) throw new Error(`Erro ao salvar Google ads: ${error.message}`);
        googleCount = rows.length;
      } else {
        notes.push(
          usedAdvertiser
            ? `Nenhum anúncio público encontrado no Google para o Advertiser ${validGoogleId}.`
            : `Nenhum anúncio público encontrado no Google para o domínio ${siteDomain}.`,
        );
      }
    }

    await admin
      .from("competitors")
      .update({ last_ads_fetched_at: new Date().toISOString() })
      .eq("id", competitorId);

    console.log(
      `[fetch-ads] done competitor=${competitorId} meta=${metaCount} google=${googleCount} notes=${notes.length}`,
    );

    return json({
      ok: true,
      meta_count: metaCount,
      google_count: googleCount,
      with_details: withDetails,
      sources,
      notes,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const lower = raw.toLowerCase();
    let msg = raw;
    if (lower.includes("aborted") || lower.includes("timeout")) msg = "Timeout ao buscar ads";
    return json({ ok: false, error: msg.slice(0, 500), notes }, 500);
  }
});
