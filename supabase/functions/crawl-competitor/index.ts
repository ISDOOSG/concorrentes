// Edge function: crawls a competitor URL using Firecrawl, captures screenshot,
// and inserts a snapshot. Updates competitors.crawl_status throughout
// (running -> success | failed) with PT-BR error messages.
//
// Invocation modes:
//  A) Trigger DB (service_role): body { competitor_id, user_id }
//  B) Client (user JWT):         body { competitor_id }

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

function ptError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out"))
    return "Timeout ao crawlear o site (>45s)";
  if (lower.includes("403")) return "Firecrawl falhou: HTTP 403 — site bloqueando scraping";
  if (lower.includes("401")) return "Chave Firecrawl inválida (401)";
  if (lower.includes("429")) return "Limite de requisições Firecrawl excedido (429)";
  if (lower.includes("payment") || lower.includes("402"))
    return "Sem créditos no Firecrawl (402)";
  return raw.slice(0, 500) || "Erro desconhecido";
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

type Structured = { prices: string[]; h1: string | null; ctas: string[] };

function diffArrays(a: string[], b: string[]): { added: string[]; removed: string[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  return {
    added: [...sb].filter((x) => !sa.has(x)),
    removed: [...sa].filter((x) => !sb.has(x)),
  };
}

type DetectedChange = {
  change_type: "pricing" | "copy" | "content";
  severity: "high" | "medium" | "low";
  summary: string;
  diff: Record<string, unknown>;
};

function detectChanges(prev: Structured, next: Structured, sameHash: boolean): DetectedChange[] {
  const changes: DetectedChange[] = [];

  if ((prev.h1 ?? "") !== (next.h1 ?? "")) {
    changes.push({
      change_type: "copy",
      severity: "low",
      summary: `H1 mudou: "${(prev.h1 ?? "").slice(0, 80)}" → "${(next.h1 ?? "").slice(0, 80)}"`,
      diff: { field: "h1", from: prev.h1, to: next.h1 },
    });
  }

  const priceDiff = diffArrays(prev.prices ?? [], next.prices ?? []);
  if (priceDiff.added.length > 0 || priceDiff.removed.length > 0) {
    changes.push({
      change_type: "pricing",
      severity: "high",
      summary:
        `Preços mudaram` +
        (priceDiff.added.length ? ` — novos: ${priceDiff.added.slice(0, 3).join(", ")}` : "") +
        (priceDiff.removed.length ? ` — removidos: ${priceDiff.removed.slice(0, 3).join(", ")}` : ""),
      diff: { field: "prices", ...priceDiff },
    });
  }

  const ctaDiff = diffArrays(prev.ctas ?? [], next.ctas ?? []);
  if (ctaDiff.added.length > 0 || ctaDiff.removed.length > 0) {
    changes.push({
      change_type: "copy",
      severity: "medium",
      summary:
        `CTAs mudaram` +
        (ctaDiff.added.length ? ` — novos: ${ctaDiff.added.slice(0, 3).join(", ")}` : "") +
        (ctaDiff.removed.length ? ` — removidos: ${ctaDiff.removed.slice(0, 3).join(", ")}` : ""),
      diff: { field: "ctas", ...ctaDiff },
    });
  }

  if (changes.length === 0 && !sameHash) {
    changes.push({
      change_type: "content",
      severity: "low",
      summary: "Conteúdo da página foi atualizado (sem mudanças estruturadas detectadas)",
      diff: { field: "content_hash" },
    });
  }

  return changes;
}

function extractStructured(markdown: string) {
  const prices = Array.from(
    markdown.matchAll(/(R\$\s?\d+(?:[.,]\d+)?|US\$\s?\d+(?:[.,]\d+)?|€\s?\d+(?:[.,]\d+)?|\$\s?\d+(?:[.,]\d+)?)/g),
  ).map((m) => m[1].trim());
  const h1Match = markdown.split("\n").find((l) => l.trim().startsWith("# "));
  const h1 = h1Match ? h1Match.replace(/^#\s+/, "").trim() : null;
  const ctaRegex = /\b(começar|comece|agendar|demo|teste grátis|experimente|cadastre|assine|comprar|fale com)\b/gi;
  const ctas = Array.from(new Set(
    Array.from(markdown.matchAll(/\[([^\]]+)\]\([^)]+\)/g))
      .map((m) => m[1].trim())
      .filter((t) => ctaRegex.test(t))
      .slice(0, 20),
  ));
  return { prices: prices.slice(0, 20), h1, ctas };
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function callFirecrawl(key: string, url: string) {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        url,
        formats: ["markdown", "screenshot"],
        onlyMainContent: true,
      }),
    },
    45_000,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
  const data = await res.json();
  const root = data?.data ?? data;
  const markdown: string = root?.markdown ?? "";
  const screenshot: string | null = root?.screenshot ?? null;
  return { markdown, screenshotUrl: screenshot, source: "firecrawl" as const };
}

async function uploadScreenshot(
  screenshotUrlOrB64: string,
  userId: string,
  competitorId: string,
  snapshotId: string,
): Promise<string | null> {
  try {
    let bytes: Uint8Array;
    if (screenshotUrlOrB64.startsWith("http")) {
      const res = await fetchWithTimeout(screenshotUrlOrB64, {}, 20_000);
      if (!res.ok) return null;
      bytes = new Uint8Array(await res.arrayBuffer());
    } else {
      const b64 = screenshotUrlOrB64.replace(/^data:image\/\w+;base64,/, "");
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    const path = `${userId}/${competitorId}/${snapshotId}.png`;
    const { error } = await admin.storage.from("screenshots").upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
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
  return { ok: true, competitorId, userId: userRes.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405);

  const inv = await resolveInvocation(req);
  if (!inv.ok) return json({ ok: false, error: inv.error }, inv.status);
  const { competitorId, userId } = inv;

  // Idempotency: snapshot inserido nos últimos 60s
  const sixtySecsAgo = new Date(Date.now() - 60_000).toISOString();
  const { data: recent } = await admin
    .from("snapshots")
    .select("id")
    .eq("competitor_id", competitorId)
    .gt("crawled_at", sixtySecsAgo)
    .limit(1);
  if (recent && recent.length > 0) {
    return json({ ok: false, error: "Crawl recente já existe (<60s)" }, 409);
  }

  // Concurrency lock
  const { data: locked, error: lockErr } = await admin
    .from("competitors")
    .update({
      crawl_status: "running",
      crawl_started_at: new Date().toISOString(),
      crawl_error: null,
    })
    .eq("id", competitorId)
    .neq("crawl_status", "running")
    .select("id, url, user_id");
  if (lockErr) return json({ ok: false, error: lockErr.message }, 500);
  if (!locked || locked.length === 0) {
    return json({ ok: false, error: "Crawl já em andamento" }, 409);
  }
  const competitor = locked[0] as { id: string; url: string; user_id: string };

  const failWith = async (msg: string, status = 500) => {
    await admin
      .from("competitors")
      .update({ crawl_status: "failed", crawl_error: msg.slice(0, 500) })
      .eq("id", competitorId);
    return json({ ok: false, error: msg }, status);
  };

  try {
    const { data: fcKey } = await admin.rpc("get_scraper_key", {
      _user_id: userId,
      _provider: "firecrawl",
    });
    if (!fcKey) {
      return await failWith(
        "Configure sua chave Firecrawl em /settings/integrations",
        400,
      );
    }

    const scraped = await callFirecrawl(fcKey as string, competitor.url);

    const markdown = (scraped.markdown ?? "").slice(0, 500_000);
    if (!markdown.trim()) throw new Error("Sem conteúdo extraído");

    const structured = extractStructured(markdown);
    const contentHash = await sha256Hex(normalize(markdown));

    const { data: snap, error: snapErr } = await admin
      .from("snapshots")
      .insert({
        user_id: userId,
        competitor_id: competitorId,
        source: scraped.source,
        content_hash: contentHash,
        raw_text: markdown,
        structured_data: structured,
        cost_cents: 1,
      })
      .select("id")
      .single();
    if (snapErr || !snap) throw new Error(snapErr?.message ?? "Falha ao salvar snapshot");

    let screenshotPath: string | null = null;
    if (scraped.screenshotUrl) {
      screenshotPath = await uploadScreenshot(
        scraped.screenshotUrl,
        userId,
        competitorId,
        snap.id,
      );
      if (screenshotPath) {
        await admin
          .from("snapshots")
          .update({ screenshot_path: screenshotPath })
          .eq("id", snap.id);
      }
    }

    // ----- Change detection (deterministic diff vs previous snapshot) -----
    try {
      const { data: prevSnaps } = await admin
        .from("snapshots")
        .select("id, content_hash, structured_data")
        .eq("competitor_id", competitorId)
        .neq("id", snap.id)
        .order("crawled_at", { ascending: false })
        .limit(1);
      const prev = prevSnaps?.[0];
      if (prev) {
        const sameHash = prev.content_hash === contentHash;
        const prevStructured = (prev.structured_data ?? {}) as Partial<Structured>;
        const detected = detectChanges(
          {
            prices: prevStructured.prices ?? [],
            h1: prevStructured.h1 ?? null,
            ctas: prevStructured.ctas ?? [],
          },
          structured,
          sameHash,
        );
        for (const ch of detected) {
          const { data: changeRow } = await admin
            .from("changes")
            .insert({
              user_id: userId,
              competitor_id: competitorId,
              from_snapshot_id: prev.id,
              to_snapshot_id: snap.id,
              change_type: ch.change_type,
              severity: ch.severity,
              summary: ch.summary,
              diff: ch.diff,
              alerted: ch.severity !== "low",
            })
            .select("id")
            .single();
          if (changeRow && ch.severity !== "low") {
            await admin.from("alerts").insert({
              user_id: userId,
              change_id: changeRow.id,
              channel: "in_app",
            });
          }
        }
      }
    } catch (diffErr) {
      console.error("change detection failed:", diffErr);
    }

    await admin
      .from("competitors")
      .update({
        crawl_status: "success",
        last_crawled_at: new Date().toISOString(),
        crawl_error: null,
      })
      .eq("id", competitorId);


    return json({ ok: true, snapshot_id: snap.id, source: scraped.source });
  } catch (err) {
    return await failWith(ptError(err), 500);
  }
});
