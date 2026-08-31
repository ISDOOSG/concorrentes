// Edge function: gera análise de SEO de um concorrente usando Lovable AI Gateway.
// Lê o snapshot mais recente (markdown + structured_data) e devolve JSON
// estruturado com score, summary, strengths, weaknesses, opportunities,
// recommendations e target_keywords. Persiste em public.seo_analyses (upsert
// por competitor_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const MODEL = "google/gemini-2.5-flash";
const MAX_MARKDOWN_CHARS = 12_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `Você é um especialista sênior em SEO técnico e de conteúdo, analisando o site de um concorrente.
Responda SEMPRE em português do Brasil, em tom executivo, direto e acionável.
Use APENAS as informações fornecidas (não invente dados de tráfego, backlinks ou métricas externas).
Se a informação não estiver no markdown, diga claramente que não foi possível avaliar aquele aspecto.`;

function buildUserPrompt(args: {
  competitor_name: string;
  domain: string;
  url: string;
  markdown: string;
  structured: unknown;
}) {
  return `Analise o SEO do site do concorrente abaixo a partir do markdown extraído.

# Concorrente
- Nome: ${args.competitor_name}
- Domínio: ${args.domain}
- URL analisada: ${args.url}

# Dados estruturados extraídos
\`\`\`json
${JSON.stringify(args.structured ?? {}, null, 2).slice(0, 2000)}
\`\`\`

# Conteúdo (markdown — pode estar truncado)
\`\`\`markdown
${args.markdown.slice(0, MAX_MARKDOWN_CHARS)}
\`\`\`

Avalie:
1. Clareza de proposta de valor / H1 / título
2. Densidade e relevância das keywords presentes
3. Estrutura de conteúdo (headings, CTAs, copy)
4. Sinais de intenção de busca atendidos
5. Oportunidades de SEO que o concorrente NÃO está cobrindo

Devolva o resultado chamando a tool save_seo_analysis com a estrutura solicitada.`;
}

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "save_seo_analysis",
    description:
      "Persiste a análise de SEO estruturada do concorrente. Use linguagem objetiva e em PT-BR.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        score: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description:
            "Nota de 0 a 100 da qualidade SEO geral do site analisado.",
        },
        summary: {
          type: "string",
          description:
            "Resumo executivo (2-4 frases) do estado SEO do concorrente.",
        },
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "3-5 pontos fortes em SEO.",
        },
        weaknesses: {
          type: "array",
          items: { type: "string" },
          description: "3-5 pontos fracos em SEO.",
        },
        opportunities: {
          type: "array",
          items: { type: "string" },
          description: "3-5 oportunidades que VOCÊ pode explorar.",
        },
        recommendations: {
          type: "array",
          items: { type: "string" },
          description: "3-6 recomendações táticas e acionáveis.",
        },
        target_keywords: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              keyword: { type: "string" },
              intent: {
                type: "string",
                enum: ["informacional", "navegacional", "transacional", "comercial"],
              },
              rationale: { type: "string" },
            },
            required: ["keyword", "intent", "rationale"],
          },
          description:
            "5-10 keywords estratégicas que o concorrente parece mirar, com intenção e justificativa.",
        },
      },
      required: [
        "score",
        "summary",
        "strengths",
        "weaknesses",
        "opportunities",
        "recommendations",
        "target_keywords",
      ],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405);

  // Auth: aceita JWT do usuário (frontend) ou service role (interno)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ ok: false, error: "Não autenticado" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Resolve user_id a partir do JWT (a menos que seja service role)
  let userId: string | null = null;
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    // chamada interna — espera user_id no body
  } else {
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user) return json({ ok: false, error: "Token inválido" }, 401);
    userId = u.user.id;
  }

  let body: { competitor_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Body JSON inválido" }, 400);
  }

  const competitorId = body.competitor_id;
  if (!competitorId) return json({ ok: false, error: "competitor_id obrigatório" }, 400);
  const effectiveUserId = userId ?? body.user_id;
  if (!effectiveUserId) return json({ ok: false, error: "user_id obrigatório" }, 400);

  // Carrega competitor (escopado ao user)
  const { data: competitor, error: cErr } = await admin
    .from("competitors")
    .select("id, name, url, user_id")
    .eq("id", competitorId)
    .eq("user_id", effectiveUserId)
    .maybeSingle();
  if (cErr) return json({ ok: false, error: cErr.message }, 500);
  if (!competitor) return json({ ok: false, error: "Concorrente não encontrado" }, 404);

  // Snapshot mais recente
  const { data: snapshot, error: sErr } = await admin
    .from("snapshots")
    .select("id, raw_text, structured_data, crawled_at")
    .eq("competitor_id", competitorId)
    .order("crawled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sErr) return json({ ok: false, error: sErr.message }, 500);
  if (!snapshot || !snapshot.raw_text) {
    return json(
      {
        ok: false,
        error:
          "Sem conteúdo coletado. Rode 'Sincronizar crawl' antes de gerar a análise de SEO.",
      },
      409,
    );
  }

  const url = competitor.url ?? "";
  const domain = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  // Lovable AI Gateway — tool call para forçar saída estruturada
  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt({
            competitor_name: competitor.name,
            domain,
            url,
            markdown: snapshot.raw_text,
            structured: snapshot.structured_data,
          }),
        },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "save_seo_analysis" } },
    }),
  });

  if (!aiResp.ok) {
    if (aiResp.status === 429) {
      return json({ ok: false, error: "Limite de uso da IA atingido. Tente novamente em alguns minutos." }, 429);
    }
    if (aiResp.status === 402) {
      return json({ ok: false, error: "Créditos de IA esgotados. Adicione créditos no workspace Lovable." }, 402);
    }
    const txt = await aiResp.text().catch(() => "");
    return json({ ok: false, error: `Falha na IA (${aiResp.status}): ${txt.slice(0, 200)}` }, 502);
  }

  const aiJson = await aiResp.json();
  const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    return json({ ok: false, error: "IA não retornou análise estruturada" }, 502);
  }

  let parsed: {
    score: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    recommendations: string[];
    target_keywords: { keyword: string; intent: string; rationale: string }[];
  };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    return json({ ok: false, error: "Resposta da IA inválida" }, 502);
  }

  const row = {
    competitor_id: competitorId,
    user_id: effectiveUserId,
    source_snapshot_id: snapshot.id,
    model: MODEL,
    score: parsed.score,
    summary: parsed.summary,
    strengths: parsed.strengths ?? [],
    weaknesses: parsed.weaknesses ?? [],
    opportunities: parsed.opportunities ?? [],
    recommendations: parsed.recommendations ?? [],
    target_keywords: parsed.target_keywords ?? [],
    meta: { domain, url, snapshot_crawled_at: snapshot.crawled_at },
    analyzed_at: new Date().toISOString(),
  };

  const { data: upserted, error: upErr } = await admin
    .from("seo_analyses")
    .upsert(row, { onConflict: "competitor_id" })
    .select()
    .maybeSingle();
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  return json({ ok: true, analysis: upserted });
});
