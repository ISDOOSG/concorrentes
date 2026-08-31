// Edge function: generates a SWOT report for a competitor using LLM.
// Body: { competitor_id: string }
// Response: { strengths, weaknesses, opportunities, threats }
// Persists into public.swot_reports.

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

type SwotItem = { title: string; evidence: string };
type Swot = {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
};

const EMPTY_SWOT: Swot = {
  strengths: [],
  weaknesses: [],
  opportunities: [],
  threats: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `Você é um analista sênior de inteligência competitiva.
Gere uma análise SWOT em português do Brasil sobre um concorrente, usando APENAS os dados fornecidos.
Para cada quadrante (Forças, Fraquezas, Oportunidades, Ameaças), produza 3 a 4 itens.
Cada item tem:
- title: até 6 palavras, direto e específico
- evidence: 1 a 2 frases citando dado concreto extraído do contexto (preço, headline, CTA, anúncio, número de seguidores, etc.). Não invente dados que não estão no contexto.
Retorne APENAS o JSON no formato { strengths:[...], weaknesses:[...], opportunities:[...], threats:[...] }.`;

function buildUserPrompt(ctx: {
  name: string;
  url: string;
  snapshot: { raw: string; structured: unknown } | null;
  ads: Array<{ body: string; cta: string | null; active: boolean | null }>;
  ig: { bio: string | null; followers: number | null; posts: number | null } | null;
}) {
  const lines: string[] = [];
  lines.push(`Concorrente: ${ctx.name}`);
  lines.push(`URL: ${ctx.url}`);
  lines.push("");
  if (ctx.snapshot) {
    lines.push("=== Último snapshot do site (markdown extraído) ===");
    lines.push(ctx.snapshot.raw.slice(0, 6000));
    lines.push("");
    lines.push("=== Dados estruturados do site ===");
    lines.push(JSON.stringify(ctx.snapshot.structured ?? {}).slice(0, 2000));
    lines.push("");
  }
  if (ctx.ads.length > 0) {
    lines.push(`=== Anúncios recentes (${ctx.ads.length}) ===`);
    for (const a of ctx.ads.slice(0, 10)) {
      lines.push(
        `- [${a.active ? "ativo" : "inativo"}] CTA="${a.cta ?? ""}" | ${a.body.slice(0, 240)}`,
      );
    }
    lines.push("");
  }
  if (ctx.ig) {
    lines.push(
      `=== Instagram === bio="${ctx.ig.bio ?? ""}" | seguidores=${ctx.ig.followers ?? "?"} | posts=${ctx.ig.posts ?? "?"}`,
    );
  }
  return lines.join("\n");
}

function emptySwot(): Swot {
  return {
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
  };
}

function normalizeSwot(parsed: unknown): Swot {
  const out = emptySwot();
  if (!parsed || typeof parsed !== "object") return out;
  const p = parsed as Record<string, unknown>;
  for (const k of ["strengths", "weaknesses", "opportunities", "threats"] as const) {
    const arr = Array.isArray(p[k]) ? (p[k] as unknown[]) : [];
    out[k] = arr
      .map((it) => {
        if (!it || typeof it !== "object") return null;
        const o = it as Record<string, unknown>;
        const title = typeof o.title === "string" ? o.title : "";
        const evidence = typeof o.evidence === "string" ? o.evidence : "";
        if (!title) return null;
        return { title: title.slice(0, 120), evidence: evidence.slice(0, 600) };
      })
      .filter((x): x is SwotItem => x !== null)
      .slice(0, 4);
  }
  return out;
}

async function callLovable(prompt: string, model: string): Promise<{ swot: Swot; raw: string }> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lovable AI ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  return { swot: normalizeSwot(parsed), raw };
}

async function callAnthropic(key: string, prompt: string, model: string): Promise<Swot> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT + "\nRetorne SOMENTE JSON, sem markdown.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "{}";
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return normalizeSwot(JSON.parse(cleaned));
}

async function callOpenAI(key: string, prompt: string, model: string): Promise<Swot> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return normalizeSwot(JSON.parse(data?.choices?.[0]?.message?.content ?? "{}"));
}

async function callGemini(key: string, prompt: string, model: string): Promise<Swot> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return normalizeSwot(JSON.parse(text));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Sessão inválida" }, 401);
    const userId = userRes.user.id;

    const body = (await req.json().catch(() => ({}))) as { competitor_id?: string };
    const competitorId = body.competitor_id;
    if (!competitorId) return json({ error: "competitor_id obrigatório" }, 400);

    // Verify ownership via RLS
    const { data: comp, error: compErr } = await userClient
      .from("competitors")
      .select("id, name, url, user_id")
      .eq("id", competitorId)
      .maybeSingle();
    if (compErr || !comp) return json({ error: "Concorrente não encontrado" }, 404);

    // Latest snapshot
    const { data: snap } = await userClient
      .from("snapshots")
      .select("raw_text, structured_data")
      .eq("competitor_id", competitorId)
      .order("crawled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!snap) {
      return json(
        { error: "Sem dados de crawl. Rode 'Crawlear agora' antes de gerar a SWOT." },
        400,
      );
    }

    // Recent ads
    const { data: ads } = await userClient
      .from("ads_snapshots")
      .select("body_text, cta_text, active")
      .eq("competitor_id", competitorId)
      .order("fetched_at", { ascending: false })
      .limit(10);

    // Instagram (if available)
    const { data: ig } = await userClient
      .from("social_snapshots")
      .select("bio, followers, posts_count")
      .eq("competitor_id", competitorId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prompt = buildUserPrompt({
      name: comp.name,
      url: comp.url,
      snapshot: { raw: snap.raw_text ?? "", structured: snap.structured_data },
      ads: (ads ?? []).map((a) => ({
        body: a.body_text ?? "",
        cta: a.cta_text,
        active: a.active,
      })),
      ig: ig
        ? { bio: ig.bio, followers: ig.followers, posts: ig.posts_count }
        : null,
    });

    // Resolve provider preference
    const { data: settings } = await userClient
      .from("user_llm_settings")
      .select("provider, model_swot")
      .eq("user_id", userId)
      .maybeSingle();

    const providerPref = (settings?.provider ?? "lovable") as
      | "lovable"
      | "anthropic"
      | "openai"
      | "gemini";

    let swot: Swot = EMPTY_SWOT;
    let modelUsed = "";

    try {
      if (providerPref === "lovable") {
        const model = settings?.model_swot ?? "google/gemini-2.5-pro";
        const { swot: s } = await callLovable(prompt, model);
        swot = s;
        modelUsed = `lovable:${model}`;
      } else {
        // Try BYOK; fallback to Lovable on missing key
        const { data: keyData } = await admin.rpc("get_llm_key", {
          _user_id: userId,
          _provider: providerPref,
        });
        const apiKey = (keyData as string | null) ?? "";
        if (!apiKey) {
          const model = settings?.model_swot ?? "google/gemini-2.5-pro";
          const { swot: s } = await callLovable(prompt, model);
          swot = s;
          modelUsed = `lovable:${model} (fallback - sem chave ${providerPref})`;
        } else if (providerPref === "anthropic") {
          const model = settings?.model_swot ?? "claude-3-5-sonnet-20241022";
          swot = await callAnthropic(apiKey, prompt, model);
          modelUsed = `anthropic:${model}`;
        } else if (providerPref === "openai") {
          const model = settings?.model_swot ?? "gpt-4o";
          swot = await callOpenAI(apiKey, prompt, model);
          modelUsed = `openai:${model}`;
        } else if (providerPref === "gemini") {
          const model = settings?.model_swot ?? "gemini-2.5-pro";
          swot = await callGemini(apiKey, prompt, model);
          modelUsed = `gemini:${model}`;
        }
      }
    } catch (llmErr) {
      return json(
        { error: `Falha no LLM: ${(llmErr as Error).message}`.slice(0, 300) },
        502,
      );
    }

    // Persist
    await admin.from("swot_reports").insert({
      user_id: userId,
      competitor_id: competitorId,
      strengths: swot.strengths,
      weaknesses: swot.weaknesses,
      opportunities: swot.opportunities,
      threats: swot.threats,
      llm_model: modelUsed,
      cost_cents: 0,
    });

    return json(swot);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
