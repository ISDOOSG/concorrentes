// Edge function: validates a user-provided scraper API key by making a
// minimal call to the upstream provider. Used by the Integrations settings
// screen before persisting the key.
//
// Body: { provider: 'firecrawl'|'scrapecreators', key?: string }
// - If `key` is present, validates that key (used during "test before save")
// - Otherwise reads the user's stored key via get_scraper_key RPC

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Provider = "firecrawl" | "scrapecreators";

async function testFirecrawl(key: string) {
  const t = Date.now();
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      url: "https://example.com",
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  const latencyMs = Date.now() - t;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false as const,
      error: `Firecrawl ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    };
  }
  return { ok: true as const, latencyMs };
}

async function testScrapeCreators(key: string) {
  const t = Date.now();
  const res = await fetch(
    "https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?query=test&limit=1",
    { headers: { "x-api-key": key } },
  );
  const latencyMs = Date.now() - t;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false as const,
      error: `ScrapeCreators ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    };
  }
  return { ok: true as const, latencyMs };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;

    // Verify the user via their JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { provider, key: keyOverride } = (await req.json()) as {
      provider: Provider;
      key?: string;
    };
    if (!["firecrawl", "scrapecreators"].includes(provider)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Provider inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let key = keyOverride?.trim();
    if (!key) {
      // Fetch the stored decrypted key with service role (only role allowed to call get_scraper_key)
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: rpcData, error: rpcErr } = await adminClient.rpc(
        "get_scraper_key",
        { _user_id: userRes.user.id, _provider: provider },
      );
      if (rpcErr) {
        return new Response(
          JSON.stringify({ ok: false, error: rpcErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      key = (rpcData as string | null) ?? "";
    }
    if (!key || key.length < 8) {
      return new Response(
        JSON.stringify({ ok: false, error: "Chave não configurada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let result;
    if (provider === "firecrawl") result = await testFirecrawl(key);
    else result = await testScrapeCreators(key);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message ?? "Erro inesperado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
