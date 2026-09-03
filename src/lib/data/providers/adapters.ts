// Adaptadores de linha do banco -> objeto de dominio.
//
// Vieram de providers/supabase.ts, que era o DataProvider da Supabase. O
// provider morreu com o desacoplamento; os adaptadores nao, porque a API
// propria devolve as mesmas colunas que o supabase-js devolvia. Foram
// separados para que providers/api.ts pudesse usa-los sem arrastar o
// supabase-js para dentro do bundle.

import type {
  Competitor,
  Alert,
  Ad,
  AdSource,
  Snapshot,
  SnapshotStructuredData,
} from "@/lib/ic-mock";
import type { CompetitorChange } from "../types";


// ----- Adapters -----

const PALETTE = [
  "var(--via-util-1)",
  "var(--via-util-2)",
  "var(--via-util-3)",
  "var(--via-util-4)",
  "var(--via-util-5)",
  "var(--via-util-6)",
];

export function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function domainOf(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

type CompetitorRow = {
  id: string;
  user_id: string;
  name: string;
  url: string;
  status: string;
  last_crawled_at: string | null;
  created_at: string;
  crawl_status?: string | null;
  crawl_error?: string | null;
  crawl_started_at?: string | null;
};

export function normalizeCrawlStatus(s: string | null | undefined): Competitor["crawlStatus"] {
  if (s === "queued" || s === "running" || s === "success" || s === "failed") return s;
  return "never";
}

export function adaptCompetitor(row: CompetitorRow): Competitor {
  const crawlStatus = normalizeCrawlStatus(row.crawl_status);
  const lastChange = row.last_crawled_at
    ? new Date(row.last_crawled_at).toLocaleDateString("pt-BR")
    : crawlStatus === "queued"
      ? "Na fila"
      : crawlStatus === "running"
        ? "Crawleando…"
        : crawlStatus === "failed"
          ? "Falhou"
          : "Aguardando crawl";
  return {
    id: row.id,
    name: row.name,
    domain: domainOf(row.url),
    category: "—",
    color: hashColor(row.id),
    favicon: (row.name[0] ?? "?").toUpperCase(),
    monitoring: row.status === "active",
    traffic: 0,
    trafficDelta: 0,
    seoKeywords: 0,
    seoDelta: 0,
    pricingTier: "—",
    lastChange,
    changeType: "content",
    changeSummary:
      crawlStatus === "failed" && row.crawl_error
        ? row.crawl_error
        : "Aguardando primeiro crawl",
    changeSeverity: crawlStatus === "failed" ? "high" : "low",
    description: "Cadastrado por você. Aguardando crawl inicial.",
    health: 0,
    trafficSeries: [0, 0, 0, 0, 0, 0, 0],
    keywordsTop: [],
    crawlStatus,
    crawlError: row.crawl_error ?? null,
    crawlStartedAt: row.crawl_started_at ?? null,
  };
}

type AlertWithChangeRow = {
  id: string;
  channel: string;
  read_at: string | null;
  created_at: string;
  change: {
    competitor_id: string;
    severity: "high" | "medium" | "low" | "info";
    summary: string | null;
    change_type: "pricing" | "feature" | "copy" | "design" | "content" | string;
  } | null;
};

// O banco usa severity in (info, warning, critical) e change_type in
// (price, copy, feature, design, traffic); o front usa (low, medium, high)
// e (pricing, copy, feature, design, content). Mapeamento explícito — o
// cast cru deixava "critical" passar como valor inválido e o contador de
// alertas críticos ficava sempre em zero.
const SEVERITY_FROM_DB: Record<string, Alert["severity"]> = {
  info: "low",
  warning: "medium",
  critical: "high",
};

const CHANGE_TYPE_FROM_DB: Record<string, Alert["type"]> = {
  price: "pricing",
  copy: "copy",
  feature: "feature",
  design: "design",
  traffic: "content",
};

export function adaptAlert(row: AlertWithChangeRow): Alert {
  const c = row.change;
  return {
    id: row.id,
    competitor: c?.competitor_id ?? "",
    severity: SEVERITY_FROM_DB[c?.severity ?? ""] ?? "low",
    type: CHANGE_TYPE_FROM_DB[c?.change_type ?? ""] ?? "content",
    title: c?.summary ?? "Mudança detectada",
    detail: row.read_at ? "Lido" : "Novo",
    read: Boolean(row.read_at),
    time: timeAgo(row.created_at),
    source: row.channel,
    confidence: 90,
  };
}

type SnapshotRow = {
  id: string;
  competitor_id: string;
  crawled_at: string;
  source: string;
  content_hash: string | null;
  raw_text: string | null;
  structured_data: unknown;
  screenshot_path: string | null;
  cost_cents: number | null;
};

export function adaptSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    competitor_id: row.competitor_id,
    crawled_at: row.crawled_at,
    source: row.source,
    content_hash: row.content_hash,
    raw_text: row.raw_text,
    structured_data:
      (row.structured_data as SnapshotStructuredData | null) ?? null,
    screenshot_path: row.screenshot_path,
    cost_cents: row.cost_cents,
  };
}

type AdRow = {
  id: string;
  competitor_id: string;
  source: string;
  ad_archive_id: string;
  active: boolean | null;
  body_text: string | null;
  cta_text: string | null;
  cta_url: string | null;
  page_name: string | null;
  creatives: unknown;
  targeting: unknown;
  spend_estimate: unknown;
  start_date: string | null;
  end_date: string | null;
  platforms: string[] | null;
  fetched_at: string;
};

export function adaptAd(row: AdRow): Ad {
  return {
    id: row.id,
    competitor: row.competitor_id,
    source: (row.source === "google" ? "google" : "meta") as AdSource,
    ad_archive_id: row.ad_archive_id,
    active: typeof row.active === "boolean" ? row.active : null,
    body_text: row.body_text ?? "",
    cta_text: row.cta_text,
    cta_url: row.cta_url,
    page_name: row.page_name,
    creatives: Array.isArray(row.creatives) ? (row.creatives as Ad["creatives"]) : [],
    targeting: (row.targeting as Ad["targeting"]) ?? null,
    spend_estimate: (row.spend_estimate as Ad["spend_estimate"]) ?? null,
    start_date: row.start_date,
    end_date: row.end_date,
    platforms: row.platforms ?? [],
    fetched_at: row.fetched_at,
  };
}

/** Linha crua de `public.changes`, como a API devolve. */
export type ChangeRow = {
  id: string;
  competitor_id: string;
  from_snapshot_id: string | null;
  to_snapshot_id: string | null;
  detected_at: string;
  change_type: string;
  severity: string;
  summary: string | null;
  diff: Record<string, unknown> | null;
};

/**
 * Mudanca do banco -> item da Timeline.
 *
 * Reaproveita os DOIS mapas acima de proposito: a Timeline e os alertas
 * mostram a mesma mudanca em telas diferentes, e ate 03/09 so os alertas
 * traduziam o vocabulario. Um segundo mapa aqui era garantia de divergirem.
 */
export function adaptChange(row: ChangeRow): CompetitorChange {
  return {
    id: row.id,
    competitorId: row.competitor_id,
    detectedAt: row.detected_at,
    date: new Date(row.detected_at).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }),
    type: CHANGE_TYPE_FROM_DB[row.change_type] ?? "content",
    severity: SEVERITY_FROM_DB[row.severity] ?? "low",
    label: row.summary ?? "Mudanca detectada",
    diff: row.diff ?? null,
  };
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `Há ${m || 1} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Há ${h}h`;
  const d = Math.floor(h / 24);
  return `Há ${d}d`;
}
