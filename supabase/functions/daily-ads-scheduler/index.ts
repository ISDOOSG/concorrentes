// Edge function: daily scheduler that enqueues fetch-competitor-ads for every
// competitor with at least one ad identifier (facebook_page_id or
// google_advertiser_id). Concurrency: 5 in-flight per user.

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

const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

async function invokeFetch(competitorId: string, userId: string) {
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/fetch-competitor-ads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ competitor_id: competitorId, user_id: userId }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<unknown>,
) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405);

  // Auth: only service_role may invoke
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "Não autorizado" }, 401);
  }

  const { data: comps, error } = await admin
    .from("competitors")
    .select("id, user_id, facebook_page_id, google_advertiser_id, status")
    .eq("status", "active")
    .or("facebook_page_id.not.is.null,google_advertiser_id.not.is.null");
  if (error) return json({ ok: false, error: error.message }, 500);

  const eligible = (comps ?? []).filter(
    (c) => c.facebook_page_id || c.google_advertiser_id,
  ) as { id: string; user_id: string }[];

  // Group by user, run 5/user in parallel
  const byUser = new Map<string, { id: string; user_id: string }[]>();
  for (const c of eligible) {
    if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
    byUser.get(c.user_id)!.push(c);
  }

  let success = 0;
  let failed = 0;

  await Promise.all(
    Array.from(byUser.values()).map((list) =>
      runWithConcurrency(list, 5, async (c) => {
        const r = await invokeFetch(c.id, c.user_id);
        if (r.ok) success++;
        else failed++;
      }),
    ),
  );

  return json({ ok: true, total: eligible.length, success, failed });
});
