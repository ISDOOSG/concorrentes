// Edge function: detect-changes — compara o snapshot recém-criado com o
// anterior do mesmo concorrente e registra uma linha em public.changes quando
// o conteúdo mudou. A classificação (tipo/severidade/resumo) é feita via
// Lovable AI usando o modelo de classificação do usuário; se o LLM falhar, a
// mudança é registrada mesmo assim com uma classificação heurística — um hash
// diferente é fato, não opinião.
//
// Invocada pelo trigger on_snapshot_inserted (via pg_net, service role).
// Auth: SOMENTE service_role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Classification = {
  change_type: "price" | "copy" | "feature" | "design" | "traffic";
  severity: "info" | "warning" | "critical";
  summary: string;
  diff: { added: string[]; removed: string[] };
};

const VALID_TYPES = new Set(["price", "copy", "feature", "design", "traffic"]);
const VALID_SEVERITIES = new Set(["info", "warning", "critical"]);

const SYSTEM_PROMPT = `Você é um analista de inteligência competitiva. Compare duas versões do conteúdo de um site concorrente e classifique a mudança mais relevante. Responda SOMENTE JSON válido no formato:
{"change_type":"price|copy|feature|design|traffic","severity":"info|warning|critical","summary":"resumo em pt-BR, 1 frase objetiva citando o que mudou","diff":{"added":["trechos novos relevantes"],"removed":["trechos removidos relevantes"]}}
Regras: severity=critical só para mudança de preço ou lançamento de funcionalidade; warning para reposicionamento de copy/oferta; info para ajustes menores. Máx 5 itens por lista do diff.`;

function heuristicClassification(): Classification {
  return {
    change_type: "copy",
    severity: "info",
    summary:
      "Conteúdo da página mudou desde a última coleta (classificação automática indisponível).",
    diff: { added: [], removed: [] },
  };
}

function normalizeClassification(parsed: unknown): Classification {
  if (!parsed || typeof parsed !== "object") return heuristicClassification();
  const p = parsed as Record<string, unknown>;
  const type = VALID_TYPES.has(p.change_type as string)
    ? (p.change_type as Classification["change_type"])
    : "copy";
  const severity = VALID_SEVERITIES.has(p.severity as string)
    ? (p.severity as Classification["severity"])
    : "info";
  const summary =
    typeof p.summary === "string" && p.summary.trim()
      ? p.summary.slice(0, 500)
      : heuristicClassification().summary;
  const rawDiff = (p.diff ?? {}) as Record<string, unknown>;
  const clean = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.slice(0, 300))
          .slice(0, 5)
      : [];
  return {
    change_type: type,
    severity,
    summary,
    diff: { added: clean(rawDiff.added), removed: clean(rawDiff.removed) },
  };
}

async function classify(
  oldText: string,
  newText: string,
  model: string,
): Promise<Classification> {
  if (!LOVABLE_API_KEY) return heuristicClassification();
  const excerpt = (t: string) => t.slice(0, 12000);
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
        {
          role: "user",
          content: `VERSÃO ANTERIOR:\n${excerpt(oldText)}\n\n---\n\nVERSÃO NOVA:\n${excerpt(newText)}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Lovable AI ${res.status}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  return normalizeClassification(JSON.parse(raw));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405);

  // Auth: só service_role (chamada vem do trigger via pg_net)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "Não autorizado" }, 401);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { snapshot_id?: string };
    const snapshotId = body.snapshot_id;
    if (!snapshotId) return json({ ok: false, error: "snapshot_id obrigatório" }, 400);

    const { data: snap, error: snapErr } = await admin
      .from("snapshots")
      .select("id, user_id, competitor_id, crawled_at, content_hash, raw_text")
      .eq("id", snapshotId)
      .maybeSingle();
    if (snapErr || !snap) return json({ ok: false, error: "Snapshot não encontrado" }, 404);

    const { data: prev } = await admin
      .from("snapshots")
      .select("id, content_hash, raw_text")
      .eq("competitor_id", snap.competitor_id)
      .lt("crawled_at", snap.crawled_at)
      .order("crawled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prev) return json({ ok: true, result: "no_previous_snapshot" });
    if (prev.content_hash === snap.content_hash) {
      return json({ ok: true, result: "no_change" });
    }

    // Já existe change para este par de snapshots? (idempotência em re-invocação)
    const { data: existing } = await admin
      .from("changes")
      .select("id")
      .eq("from_snapshot_id", prev.id)
      .eq("to_snapshot_id", snap.id)
      .maybeSingle();
    if (existing) return json({ ok: true, result: "already_detected", change_id: existing.id });

    const { data: settings } = await admin
      .from("user_llm_settings")
      .select("model_classification")
      .eq("user_id", snap.user_id)
      .maybeSingle();
    const model = settings?.model_classification ?? "google/gemini-2.5-flash";

    let cls: Classification;
    try {
      cls = await classify(prev.raw_text ?? "", snap.raw_text ?? "", model);
    } catch (_e) {
      cls = heuristicClassification();
    }

    const { data: change, error: insErr } = await admin
      .from("changes")
      .insert({
        user_id: snap.user_id,
        competitor_id: snap.competitor_id,
        from_snapshot_id: prev.id,
        to_snapshot_id: snap.id,
        change_type: cls.change_type,
        severity: cls.severity,
        summary: cls.summary,
        diff: cls.diff,
      })
      .select("id")
      .single();
    if (insErr) return json({ ok: false, error: insErr.message }, 500);

    return json({ ok: true, result: "change_detected", change_id: change.id, classification: cls });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
