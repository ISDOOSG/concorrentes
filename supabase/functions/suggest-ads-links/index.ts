// Edge function: suggests facebook_page_id + google_advertiser_id for a competitor
// using (A) regex on snapshot markdown, (B) ScrapeCreators search, (C) LLM arbiter.
//
// Invocation modes:
//  A) Trigger / scheduler (service_role): body { competitor_id, user_id }
//  B) Client (user JWT):                  body { competitor_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

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

async function resolveInvocation(req: Request): Promise<
  | { ok: true; competitorId: string; userId: string }
  | { ok: false; status: number; error: string }
> {
  const body = await req.json().catch(() => ({}));
  const competitorId = body?.competitor_id as string | undefined;
  if (!competitorId) {
    return { ok: false, status: 400, error: "competitor_id obrigatório" };
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token && token === SUPABASE_SERVICE_ROLE_KEY) {
    const userId = body?.user_id as string | undefined;
    if (!userId) return { ok: false, status: 400, error: "user_id obrigatório" };
    return { ok: true, competitorId, userId };
  }

  if (!token) return { ok: false, status: 401, error: "Não autenticado" };

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) {
    return { ok: false, status: 401, error: "Sessão inválida" };
  }
  return { ok: true, competitorId, userId: u.user.id };
}

const FB_BLOCK = new Set([
  "sharer",
  "tr",
  "plugins",
  "dialog",
  "share",
  "intent",
  "watch",
  "events",
  "groups",
  "marketplace",
  "help",
  "policies",
  "business",
  "policy.php",
  "login",
  "login.php",
  "privacy",
  "terms",
  "ads",
]);

function uniqTop<T>(arr: T[], n = 5): T[] {
  return Array.from(new Set(arr)).slice(0, n);
}

function extractCandidates(markdown: string) {
  const fb: string[] = [];
  const ig: string[] = [];
  const google: string[] = [];

  const FB_RE = /facebook\.com\/(?!sharer|tr\?|plugins)([\w.\-]+)/gi;
  const GOOGLE_RE = /adstransparency\.google\.com\/advertiser\/(AR\d+)/gi;
  const IG_RE = /instagram\.com\/([\w.\-]+)/gi;

  for (const m of markdown.matchAll(FB_RE)) {
    const u = m[1].replace(/\/+$/, "").split("?")[0];
    if (!u || FB_BLOCK.has(u.toLowerCase())) continue;
    if (u.endsWith(".php")) continue;
    fb.push(u);
  }
  const IG_BLOCK = new Set([
    "p", "reel", "reels", "explore", "stories", "tv", "accounts",
    "about", "developer", "directory", "legal", "privacy", "terms",
    "help", "press", "api",
  ]);
  for (const m of markdown.matchAll(IG_RE)) {
    const u = m[1].replace(/\/+$/, "").split("?")[0];
    if (!u) continue;
    if (IG_BLOCK.has(u.toLowerCase())) continue;
    ig.push(u);
  }
  for (const m of markdown.matchAll(GOOGLE_RE)) {
    google.push(m[1]);
  }
  return {
    fb: uniqTop(fb, 5),
    ig: uniqTop(ig, 5),
    google: uniqTop(google, 5),
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type FbSearchHit = { name?: string; id?: string; followers_count?: number };
type GoogleSearchHit = {
  advertiser_name?: string;
  advertiser_id?: string;
  country?: string;
};

async function scrapeCreatorsSearch(
  apiKey: string,
  competitorName: string,
): Promise<{ fb: FbSearchHit[]; google: GoogleSearchHit[] }> {
  const headers = { "x-api-key": apiKey };
  const q = encodeURIComponent(competitorName);
  const out = { fb: [] as FbSearchHit[], google: [] as GoogleSearchHit[] };

  try {
    const r = await fetchWithTimeout(
      `https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?query=${q}&limit=5`,
      { headers },
      15000,
    );
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const arr = (j?.results ?? j?.companies ?? j?.data ?? j) as unknown;
      if (Array.isArray(arr)) out.fb = arr.slice(0, 5) as FbSearchHit[];
    }
  } catch (e) {
    console.warn("scrapecreators FB search failed:", e);
  }

  try {
    const r = await fetchWithTimeout(
      `https://api.scrapecreators.com/v1/google/adLibrary/advertisers/search?query=${q}&limit=5`,
      { headers },
      15000,
    );
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const arr = (j?.results ?? j?.advertisers ?? j?.data ?? j) as unknown;
      if (Array.isArray(arr)) out.google = arr.slice(0, 5) as GoogleSearchHit[];
    }
  } catch (e) {
    console.warn("scrapecreators Google search failed:", e);
  }

  return out;
}

const FB_VALID = /^[a-z0-9_.\-]+$/i;
const GOOGLE_VALID = /^AR\d+$/;

type LlmResult = {
  facebook_page_id: string | null;
  google_advertiser_id: string | null;
  confidence: { meta: number; google: number };
  reasoning: string;
};

async function llmArbitrate(input: {
  competitor: { name: string; url: string };
  fbFromSite: string[];
  igFromSite: string[];
  googleFromSite: string[];
  fbFromSearch: FbSearchHit[];
  googleFromSearch: GoogleSearchHit[];
}): Promise<LlmResult> {
  if (!LOVABLE_API_KEY) {
    return {
      facebook_page_id: input.fbFromSite[0] ?? null,
      google_advertiser_id: input.googleFromSite[0] ?? null,
      confidence: {
        meta: input.fbFromSite[0] ? 0.3 : 0,
        google: input.googleFromSite[0] ? 0.3 : 0,
      },
      reasoning: "LLM indisponível — usando primeiro candidato do markdown.",
    };
  }

  const domain = extractDomain(input.competitor.url);
  const prompt = `Você está identificando contas oficiais de um concorrente em redes sociais e plataformas de ads.

Concorrente:
- Nome: ${input.competitor.name}
- URL: ${input.competitor.url}
- Domínio: ${domain}

Candidatos do site (extraídos do markdown):
- Facebook: ${JSON.stringify(input.fbFromSite)}
- Instagram (use só pra inferir FB se necessário): ${JSON.stringify(input.igFromSite)}
- Google Advertiser: ${JSON.stringify(input.googleFromSite)}

Candidatos do ScrapeCreators search:
- Facebook (top 5): ${JSON.stringify(
    input.fbFromSearch.map((c) => ({
      name: c.name,
      id: c.id,
      followers_count: c.followers_count,
    })),
  )}
- Google (top 5): ${JSON.stringify(
    input.googleFromSearch.map((a) => ({
      advertiser_name: a.advertiser_name,
      advertiser_id: a.advertiser_id,
      country: a.country,
    })),
  )}

Tarefa: identificar a Page/Advertiser oficial deste concorrente. Não invente.
Se não tiver certeza alta, retorne null + confidence baixa.`;

  try {
    const resp = await fetchWithTimeout(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "Você identifica contas oficiais de marcas. Responda apenas chamando a função fornecida.",
            },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "submit_ads_links",
                description: "Retorna IDs oficiais detectados.",
                parameters: {
                  type: "object",
                  properties: {
                    facebook_page_id: { type: ["string", "null"] },
                    google_advertiser_id: { type: ["string", "null"] },
                    confidence: {
                      type: "object",
                      properties: {
                        meta: { type: "number", minimum: 0, maximum: 1 },
                        google: { type: "number", minimum: 0, maximum: 1 },
                      },
                      required: ["meta", "google"],
                      additionalProperties: false,
                    },
                    reasoning: { type: "string" },
                  },
                  required: [
                    "facebook_page_id",
                    "google_advertiser_id",
                    "confidence",
                    "reasoning",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "submit_ads_links" },
          },
        }),
      },
      30000,
    );

    if (!resp.ok) {
      const t = await resp.text();
      return {
        facebook_page_id: null,
        google_advertiser_id: null,
        confidence: { meta: 0, google: 0 },
        reasoning: `falha técnica LLM ${resp.status}: ${t.slice(0, 160)}`,
      };
    }
    const j = await resp.json();
    const call = j?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) {
      return {
        facebook_page_id: null,
        google_advertiser_id: null,
        confidence: { meta: 0, google: 0 },
        reasoning: "LLM não retornou tool_call",
      };
    }
    const parsed = JSON.parse(argsStr) as LlmResult;
    return {
      facebook_page_id: parsed.facebook_page_id ?? null,
      google_advertiser_id: parsed.google_advertiser_id ?? null,
      confidence: {
        meta: Number(parsed.confidence?.meta ?? 0) || 0,
        google: Number(parsed.confidence?.google ?? 0) || 0,
      },
      reasoning: String(parsed.reasoning ?? "").slice(0, 600),
    };
  } catch (e) {
    return {
      facebook_page_id: null,
      google_advertiser_id: null,
      confidence: { meta: 0, google: 0 },
      reasoning: `falha técnica: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const inv = await resolveInvocation(req);
    if (!inv.ok) return json({ error: inv.error }, inv.status);
    const { competitorId, userId } = inv;

    // Load competitor
    const { data: comp, error: compErr } = await admin
      .from("competitors")
      .select(
        "id, name, url, user_id, ads_link_suggested_at, facebook_page_suggestion, google_advertiser_suggestion, ads_link_confidence, ads_link_reasoning",
      )
      .eq("id", competitorId)
      .eq("user_id", userId)
      .maybeSingle();
    if (compErr || !comp) {
      return json({ error: "Concorrente não encontrado" }, 404);
    }

    // Idempotency: < 24h returns cached
    if (
      comp.ads_link_suggested_at &&
      Date.now() - new Date(comp.ads_link_suggested_at).getTime() <
        24 * 60 * 60 * 1000
    ) {
      return json({
        ok: true,
        cached: true,
        facebook_page_id: comp.facebook_page_suggestion,
        google_advertiser_id: comp.google_advertiser_suggestion,
        confidence: comp.ads_link_confidence ?? { meta: 0, google: 0 },
        reasoning: comp.ads_link_reasoning ?? "",
      });
    }

    // Latest snapshot markdown
    const { data: snap } = await admin
      .from("snapshots")
      .select("raw_text")
      .eq("competitor_id", competitorId)
      .order("crawled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const markdown = (snap?.raw_text ?? "") as string;

    if (!markdown.trim()) {
      const reasoning = "sem snapshot disponível";
      await admin
        .from("competitors")
        .update({
          facebook_page_suggestion: null,
          google_advertiser_suggestion: null,
          ads_link_confidence: { meta: 0, google: 0 },
          ads_link_reasoning: reasoning,
          ads_link_suggested_at: new Date().toISOString(),
        })
        .eq("id", competitorId);
      return json({
        ok: true,
        facebook_page_id: null,
        google_advertiser_id: null,
        confidence: { meta: 0, google: 0 },
        reasoning,
      });
    }

    const { fb: fbFromSite, ig: igFromSite, google: googleFromSite } =
      extractCandidates(markdown);

    // ScrapeCreators search (optional)
    let fbFromSearch: FbSearchHit[] = [];
    let googleFromSearch: GoogleSearchHit[] = [];
    const { data: scKey } = await admin.rpc("get_scraper_key", {
      _user_id: userId,
      _provider: "scrapecreators",
    });
    if (typeof scKey === "string" && scKey.length > 0) {
      const sr = await scrapeCreatorsSearch(scKey, comp.name);
      fbFromSearch = sr.fb;
      googleFromSearch = sr.google;
    }

    // LLM
    const result = await llmArbitrate({
      competitor: { name: comp.name, url: comp.url },
      fbFromSite,
      igFromSite,
      googleFromSite,
      fbFromSearch,
      googleFromSearch,
    });

    // Validate IDs — bogus → null
    let fbId = result.facebook_page_id;
    let gId = result.google_advertiser_id;
    if (fbId && !FB_VALID.test(fbId)) fbId = null;
    if (gId && !GOOGLE_VALID.test(gId)) gId = null;

    const confidence = {
      meta: fbId ? Math.max(0, Math.min(1, result.confidence.meta)) : 0,
      google: gId ? Math.max(0, Math.min(1, result.confidence.google)) : 0,
    };

    const igSuggestion = igFromSite[0] ?? null;
    const IG_VALID = /^[a-z0-9_.]{1,30}$/i;
    const igClean = igSuggestion && IG_VALID.test(igSuggestion) ? igSuggestion.toLowerCase() : null;

    await admin
      .from("competitors")
      .update({
        facebook_page_suggestion: fbId,
        google_advertiser_suggestion: gId,
        instagram_handle_suggestion: igClean,
        ads_link_confidence: confidence,
        ads_link_reasoning: result.reasoning,
        ads_link_suggested_at: new Date().toISOString(),
      })
      .eq("id", competitorId);

    return json({
      ok: true,
      facebook_page_id: fbId,
      google_advertiser_id: gId,
      instagram_handle: igClean,
      confidence,
      reasoning: result.reasoning,
    });
  } catch (e) {
    console.error("suggest-ads-links error:", e);
    return json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      500,
    );
  }
});
