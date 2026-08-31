// Analyzes the latest Instagram snapshot via Lovable AI Gateway.
// Body: { competitor_id, user_id?, platform?: 'instagram' }

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
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function resolveInvocation(req: Request) {
  const body = await req.json().catch(() => ({}));
  const competitorId = body?.competitor_id as string | undefined;
  if (!competitorId) return { ok: false as const, status: 400, error: "competitor_id obrigatório" };
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

type Post = {
  shortcode: string;
  type: "image" | "video" | "carousel";
  caption: string;
  taken_at: string | null;
  like_count: number;
  comment_count: number;
  video_view_count: number | null;
  permalink: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const inv = await resolveInvocation(req);
    if (!inv.ok) return json({ error: inv.error }, inv.status);
    const { competitorId, userId, platform } = inv;

    if (platform !== "instagram") return json({ error: `Plataforma ${platform} não suportada` }, 400);
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY ausente" }, 500);

    const { data: comp } = await admin
      .from("competitors")
      .select("id, name, url, user_id")
      .eq("id", competitorId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!comp) return json({ error: "Concorrente não encontrado" }, 404);

    const { data: snap } = await admin
      .from("social_snapshots")
      .select("id, handle, followers, posts_count, bio, recent_posts, fetched_at")
      .eq("competitor_id", competitorId)
      .eq("platform", "instagram")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!snap) return json({ error: "Sem snapshot do Instagram. Faça uma busca antes." }, 422);

    const posts = (snap.recent_posts as Post[] | null) ?? [];
    if (posts.length === 0) {
      return json({ error: "Snapshot sem posts pra analisar." }, 422);
    }

    const followers = Number(snap.followers ?? 0);
    const compactPosts = posts.map((p) => ({
      shortcode: p.shortcode,
      type: p.type,
      taken_at: p.taken_at,
      likes: p.like_count,
      comments: p.comment_count,
      views: p.video_view_count,
      caption: (p.caption ?? "").slice(0, 400),
      permalink: p.permalink,
    }));

    const prompt = `Você analisa a estratégia pública de Instagram de um concorrente.

Concorrente: ${comp.name} (${comp.url})
Handle: @${snap.handle}
Followers: ${followers.toLocaleString("pt-BR")}
Posts no perfil: ${snap.posts_count ?? "n/a"}
Bio: ${snap.bio ?? "(vazia)"}

Últimos ${posts.length} posts (JSON):
${JSON.stringify(compactPosts, null, 2)}

Tarefa: produza análise objetiva e acionável em pt-BR. Use base de followers=${followers} pra calcular taxas.
Inclua frequência semanal (estime pelos timestamps), mix de formatos (Reel/Foto/Carrossel %), 3-5 temas dominantes (palavras-chave/hashtags), engajamento médio (likes+comments / followers), top 3 posts (com permalink), e 3 insights acionáveis pra nossa marca competir.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "submit_analysis",
          description: "Retorna análise estruturada do perfil",
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "cadence", "format_mix", "themes", "engagement", "top_posts", "insights"],
            properties: {
              summary: { type: "string", description: "1-2 frases resumindo a estratégia" },
              cadence: {
                type: "object",
                additionalProperties: false,
                required: ["posts_per_week", "best_weekday", "notes"],
                properties: {
                  posts_per_week: { type: "number" },
                  best_weekday: { type: "string", description: "Ex: Quinta-feira" },
                  notes: { type: "string" },
                },
              },
              format_mix: {
                type: "object",
                additionalProperties: false,
                required: ["reel_pct", "image_pct", "carousel_pct"],
                properties: {
                  reel_pct: { type: "number" },
                  image_pct: { type: "number" },
                  carousel_pct: { type: "number" },
                },
              },
              themes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "weight"],
                  properties: {
                    label: { type: "string" },
                    weight: { type: "number", description: "0..1" },
                  },
                },
              },
              engagement: {
                type: "object",
                additionalProperties: false,
                required: ["avg_likes", "avg_comments", "engagement_rate_pct"],
                properties: {
                  avg_likes: { type: "number" },
                  avg_comments: { type: "number" },
                  engagement_rate_pct: { type: "number", description: "(likes+comments)/followers * 100" },
                },
              },
              top_posts: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["shortcode", "permalink", "reason"],
                  properties: {
                    shortcode: { type: "string" },
                    permalink: { type: "string" },
                    reason: { type: "string" },
                  },
                },
              },
              insights: {
                type: "array",
                items: { type: "string" },
                description: "3 insights acionáveis pra nossa marca competir",
              },
            },
          },
        },
      },
    ];

    const aiResp = await fetchWithTimeout(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Você é analista sênior de social media. Responda apenas chamando a função." },
            { role: "user", content: prompt },
          ],
          tools,
          tool_choice: { type: "function", function: { name: "submit_analysis" } },
        }),
      },
      45000,
    );

    if (!aiResp.ok) {
      const t = await aiResp.text();
      if (aiResp.status === 429) return json({ error: "Rate limit no AI Gateway. Tente novamente." }, 429);
      if (aiResp.status === 402) return json({ error: "Créditos do AI Gateway esgotados." }, 402);
      console.error("[analyze-social-ig] AI error", aiResp.status, t.slice(0, 200));
      return json({ error: `AI gateway ${aiResp.status}` }, 500);
    }
    const aiJson = await aiResp.json();
    const argsStr = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return json({ error: "IA não retornou análise" }, 500);
    const parsed = JSON.parse(argsStr);

    const { data: inserted, error: insErr } = await admin
      .from("social_analyses")
      .insert({
        user_id: userId,
        competitor_id: competitorId,
        platform: "instagram",
        source_snapshot_id: snap.id,
        model: "google/gemini-2.5-flash",
        summary: parsed.summary ?? null,
        cadence: parsed.cadence ?? {},
        format_mix: parsed.format_mix ?? {},
        themes: parsed.themes ?? [],
        engagement: parsed.engagement ?? {},
        top_posts: parsed.top_posts ?? [],
        insights: parsed.insights ?? [],
        cost_cents: 1,
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("[analyze-social-ig] insert error", insErr);
      return json({ error: insErr.message }, 500);
    }

    return json({ ok: true, analysis_id: inserted?.id ?? null });
  } catch (e) {
    console.error("[analyze-social-ig] fatal", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
