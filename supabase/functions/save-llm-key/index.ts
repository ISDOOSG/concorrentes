// Edge function: persists a user's BYOK LLM API key (Anthropic/OpenAI/Gemini).
// Uses the SECURITY DEFINER RPC `set_llm_key` to encrypt + upsert under the
// caller's auth.uid().
//
// Body: { provider: 'anthropic'|'openai'|'gemini', key: string }
// Response: LLMSettings (camelCase shape consumed by the front-end)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Provider = "anthropic" | "openai" | "gemini";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Não autenticado" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Sessão inválida" }, 401);
    const userId = userRes.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      provider?: string;
      key?: string;
    };
    const provider = body.provider as Provider;
    const key = (body.key ?? "").trim();

    if (!provider || !["anthropic", "openai", "gemini"].includes(provider)) {
      return json({ error: "Provider inválido" }, 400);
    }
    if (!key || key.length < 20) {
      return json({ error: "Chave muito curta (mín. 20 caracteres)" }, 400);
    }

    const { error: rpcErr } = await userClient.rpc("set_llm_key", {
      _provider: provider,
      _plain: key,
    });
    if (rpcErr) {
      return json({ error: rpcErr.message }, 500);
    }

    // Build LLMSettings response (mirrors providers/supabase.ts getLlmSettings)
    const [{ data: settings }, { data: keys }] = await Promise.all([
      userClient
        .from("user_llm_settings")
        .select("provider, model_classification, model_swot")
        .eq("user_id", userId)
        .maybeSingle(),
      userClient
        .from("user_llm_keys")
        .select("provider, key_hint, created_at")
        .eq("user_id", userId),
    ]);

    const hasKeyByProvider: Record<string, { keyHint: string; createdAt: string }> = {};
    for (const k of keys ?? []) {
      if (k.provider === "lovable") continue;
      hasKeyByProvider[k.provider] = {
        keyHint: k.key_hint ?? "",
        createdAt: k.created_at,
      };
    }

    return json({
      provider: settings?.provider ?? "lovable",
      modelClassification: settings?.model_classification ?? null,
      modelSwot: settings?.model_swot ?? null,
      hasKeyByProvider,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
