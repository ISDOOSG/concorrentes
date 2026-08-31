// Edge function: popula public.app_config com service_role_key e functions_base_url
// usando os segredos de ambiente. Necessário para que triggers (invoke_crawl_competitor,
// invoke_detect_changes, invoke_generate_alerts) e cron jobs (daily-*-scheduler)
// consigam invocar Edge Functions via pg_net.
//
// Idempotente. Apenas administradores devem chamar — protegida por SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405);

  // Auth: aceita service_role OU bootstrap one-shot quando service_role_key ainda está vazio.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;

  if (!isServiceRole) {
    const { data: existing } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "service_role_key")
      .maybeSingle();
    if (existing?.value && existing.value.length > 0) {
      return json({ ok: false, error: "Já configurado. Use service_role para reconfigurar." }, 401);
    }
  }

  const functionsBaseUrl = `${SUPABASE_URL}/functions/v1`;

  const rows = [
    { key: "functions_base_url", value: functionsBaseUrl },
    { key: "service_role_key", value: SUPABASE_SERVICE_ROLE_KEY },
  ];

  const { error } = await admin.from("app_config").upsert(rows, { onConflict: "key" });
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({
    ok: true,
    populated: rows.map((r) => ({
      key: r.key,
      length: r.value.length,
      preview: r.key === "functions_base_url" ? r.value : `${r.value.slice(0, 6)}…`,
    })),
  });
});
