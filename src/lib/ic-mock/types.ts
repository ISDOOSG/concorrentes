export type ChangeType = "pricing" | "feature" | "copy" | "design" | "content";
export type Severity = "high" | "medium" | "low";
export type CrawlStatus =
  | "never"
  | "queued"
  | "running"
  | "success"
  | "failed";

// Ads monitoring (Meta + Google via ScrapeCreators)
export type AdSource = "meta" | "google";

export type AdCreative = {
  type: "image" | "video";
  url: string;          // pode ser vazio em mock — UI usa thumbnail abstrato
  thumbnail?: string;
};

export type AdSpendEstimate = {
  lower_bound?: number;
  upper_bound?: number;
  currency?: string;    // BRL, USD, EUR
};

export type AdTargeting = {
  age_min?: number;
  age_max?: number;
  genders?: Array<"male" | "female" | "all">;
  countries?: string[]; // ISO codes
  locations?: string[];
};

export type Ad = {
  id: string;
  competitor: string;     // competitor_id
  source: AdSource;
  ad_archive_id: string;
  active: boolean | null;
  body_text: string;
  cta_text: string | null;
  cta_url: string | null;
  page_name: string | null;
  creatives: AdCreative[];
  targeting: AdTargeting | null;
  spend_estimate: AdSpendEstimate | null;
  start_date: string | null;  // ISO
  end_date: string | null;
  platforms: string[];        // ['facebook','instagram','audience_network']
  fetched_at: string;
};

// Sugestões automáticas de vínculos de ads (preenchidas por
// `suggest-ads-links` Edge Function: regex no markdown + ScrapeCreators
// search + LLM como árbitro).
export type AdsLinkSuggestion = {
  facebookPageId: string | null;
  googleAdvertiserId: string | null;
  confidence: { meta: number; google: number };
  reasoning: string | null;
  suggestedAt: string | null;
};

// Snapshot — resultado de um crawl (Firecrawl) em um competitor.
// Vem da tabela `snapshots` ou simulado pelo mock.
export type SnapshotStructuredData = {
  prices?: string[];
  h1?: string | null;
  ctas?: string[];
  [k: string]: unknown;
};

export type Snapshot = {
  id: string;
  competitor_id: string;
  crawled_at: string;
  source: string;        // 'firecrawl' | 'scrapfly' | etc
  content_hash: string | null;
  raw_text: string | null;
  structured_data: SnapshotStructuredData | null;
  screenshot_path: string | null;
  cost_cents: number | null;
};

export type Competitor = {
  id: string;
  name: string;
  domain: string;
  category: string;
  color: string;
  favicon: string;
  monitoring: boolean;
  traffic: number;
  trafficDelta: number;
  seoKeywords: number;
  seoDelta: number;
  pricingTier: string;
  lastChange: string;
  changeType: ChangeType;
  changeSummary: string;
  changeSeverity: Severity;
  description: string;
  health: number;
  trafficSeries: number[];
  keywordsTop: string[];
  crawlStatus?: CrawlStatus;
  crawlError?: string | null;
  crawlStartedAt?: string | null;
};

export type Alert = {
  id: string;
  competitor: string;
  severity: Severity;
  type: ChangeType;
  title: string;
  detail: string;
  time: string;
  source: string;
  confidence: number;
  /** Se o alerta ja foi marcado como lido. Ate 03/09 o estado de leitura so
   *  existia embutido na string `detail` ("Lido"/"Novo"), o que impedia
   *  contar nao lidos sem comparar texto. */
  read?: boolean;
};

export type SwotItem = { title: string; evidence: string };
export type Swot = {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
};

export type KeywordRow = {
  keyword: string;
  volume: number;
  ours: number;
  rd: number;
  pipe: number;
  hub: number;
  ploo: number;
  agen: number;
};

export type TimelineItem = {
  date: string;
  type: ChangeType;
  label: string;
  severity: Severity;
};
