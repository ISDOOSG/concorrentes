import {
  COMPETITORS,
  ALERTS,
  SWOT,
  ADS,
  type Competitor,
  type Alert,
  type Swot,
  type Ad,
  type Snapshot,
} from "@/lib/ic-mock";
import { TIMELINE_RD } from "@/lib/ic-mock/timeline";
import type {
  CompetitorChange,
  CreateCompetitorInput,
  DataProvider,
  LLMProviderId,
  LLMSettings,
  LLMUseCase,
  ScraperKeyInfo,
  ScraperKeySource,
  ScraperProviderId,
  ScraperTestResult,
} from "../types";

const STORAGE_KEY = "ac-mock-state";
const LATENCY_MS = 350;
const SWOT_GEN_LATENCY_MS = 2800;

type PersistedScraperKey = {
  keyHint: string;
  source: ScraperKeySource;
  updatedAt: string;
  // we keep the plain key locally only in mock mode so testScraperKey can echo it
  plain: string;
};

type MockCrawlJob = {
  startedAt: string;
  queuedUntil: number;
  runningUntil: number;
  finalStatus: "success" | "failed";
  error?: string;
};

type AdsLink = {
  facebookPageId?: string | null;
  googleAdvertiserId?: string | null;
};

type PersistedState = {
  userCompetitors: Competitor[];
  pausedIds: string[];
  deletedSeedIds: string[];
  alertsRead: string[];
  llm: LLMSettings;
  scraperKeys: Partial<Record<ScraperProviderId, PersistedScraperKey>>;
  crawlJobs: Record<string, MockCrawlJob>;
  adsLinks: Record<string, AdsLink>;
  snapshots: Record<string, Snapshot[]>; // por competitor_id, ordem desc
};

function defaultState(): PersistedState {
  return {
    userCompetitors: [],
    pausedIds: [],
    deletedSeedIds: [],
    alertsRead: [],
    llm: {
      provider: "lovable",
      modelClassification: null,
      modelSwot: null,
      hasKeyByProvider: {},
    },
    scraperKeys: {},
    crawlJobs: {},
    adsLinks: {},
    snapshots: {},
  };
}

const QUEUED_MS = 1500;
const RUNNING_MS = 3000;
const FAIL_RATE = 0.1;
const FAIL_MESSAGES = [
  "Simulação: timeout no Firecrawl após 30s.",
  "Simulação: site bloqueou scraping (HTTP 403).",
  "Simulação: chave Firecrawl inválida ou faltando.",
];

function scheduleCrawl(state: PersistedState, id: string) {
  const now = Date.now();
  const fail = Math.random() < FAIL_RATE;
  state.crawlJobs[id] = {
    startedAt: new Date().toISOString(),
    queuedUntil: now + QUEUED_MS,
    runningUntil: now + QUEUED_MS + RUNNING_MS,
    finalStatus: fail ? "failed" : "success",
    error: fail
      ? FAIL_MESSAGES[Math.floor(Math.random() * FAIL_MESSAGES.length)]
      : undefined,
  };
}

function currentJobStatus(
  job: MockCrawlJob,
): {
  status: NonNullable<Competitor["crawlStatus"]>;
  error: string | null;
  startedAt: string;
} {
  const now = Date.now();
  if (now < job.queuedUntil)
    return { status: "queued", error: null, startedAt: job.startedAt };
  if (now < job.runningUntil)
    return { status: "running", error: null, startedAt: job.startedAt };
  return {
    status: job.finalStatus,
    error: job.finalStatus === "failed" ? (job.error ?? null) : null,
    startedAt: job.startedAt,
  };
}

function makeMockSnapshot(comp: Competitor, job: MockCrawlJob): Snapshot {
  // Markdown sintético — convincente o bastante pra demo, sem
  // tentar ser realista. UI vai mostrar resumo.
  const md = [
    `# ${comp.name}`,
    "",
    comp.description,
    "",
    `## Sobre`,
    `Página principal de ${comp.domain} foi crawleada com sucesso. Conteúdo extraído inclui propostas de valor, CTAs e estrutura de preços.`,
    "",
    "## Sinais detectados",
    "- Posicionamento: orientado a B2B mid-market",
    "- Tom: confiante, focado em ROI e velocidade",
    "- Stack: Next.js, Vercel, HubSpot Forms, Segment",
  ].join("\n");
  return {
    id: "snap_" + Math.random().toString(36).slice(2, 10),
    competitor_id: comp.id,
    crawled_at: new Date(job.runningUntil).toISOString(),
    source: "firecrawl",
    content_hash: null,
    raw_text: md,
    structured_data: {
      h1: comp.name,
      prices: ["R$ 49/mês", "R$ 199/mês", "R$ 349/mês"],
      ctas: ["Agendar demo", "Teste grátis", "Ver preços"],
    },
    screenshot_path: null,
    cost_cents: 1,
  };
}

function readState(): PersistedState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...(JSON.parse(raw) as PersistedState) };
  } catch {
    return defaultState();
  }
}

function writeState(s: PersistedState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function delay<T>(value: T, ms: number = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function deriveCompetitors(): Competitor[] {
  const s = readState();
  const seeds = COMPETITORS.filter((c) => !s.deletedSeedIds.includes(c.id)).map(
    (c) =>
      ({
        ...c,
        // seeds são "ricos" e já considerados crawled com sucesso
        crawlStatus: c.crawlStatus ?? "success",
        crawlError: null,
        crawlStartedAt: null,
      }) as Competitor,
  );
  const merged = [...s.userCompetitors, ...seeds];

  // Side-effect: ao primeiro derive em que detectar success de um job,
  // insere snapshot mock pra esse competitor (idempotente — não re-insere
  // se já existir snapshot com mesmo `crawled_at`).
  let mutated = false;
  for (const c of merged) {
    const job = s.crawlJobs[c.id];
    if (!job) continue;
    const cur = currentJobStatus(job);
    if (cur.status !== "success") continue;
    const list = s.snapshots[c.id] ?? [];
    const stamp = new Date(job.runningUntil).toISOString();
    if (list.some((sn) => sn.crawled_at === stamp)) continue;
    s.snapshots[c.id] = [
      makeMockSnapshot(c as Competitor, job),
      ...list,
    ].slice(0, 50);
    mutated = true;
  }
  // Para seeds (que não passam por job), garantir 1 snapshot fake.
  for (const seed of seeds) {
    if ((s.snapshots[seed.id] ?? []).length > 0) continue;
    s.snapshots[seed.id] = [
      makeMockSnapshot(seed, {
        startedAt: new Date(Date.now() - 86_400_000).toISOString(),
        queuedUntil: 0,
        runningUntil: Date.now() - 86_400_000,
        finalStatus: "success",
      }),
    ];
    mutated = true;
  }
  if (mutated) writeState(s);

  return merged.map((c) => {
    const monitoring = !s.pausedIds.includes(c.id);
    const job = s.crawlJobs[c.id];
    if (!job) return { ...c, monitoring };
    const cur = currentJobStatus(job);
    return {
      ...c,
      monitoring,
      crawlStatus: cur.status,
      crawlError: cur.error,
      crawlStartedAt: cur.startedAt,
    };
  });
}

function newId() {
  return "c_" + Math.random().toString(36).slice(2, 10);
}

const COLORS = [
  "var(--via-util-1)",
  "var(--via-util-2)",
  "var(--via-util-3)",
  "var(--via-util-4)",
  "var(--via-util-5)",
  "var(--via-util-6)",
];

export const mockProvider: DataProvider = {
  async listCompetitors() {
    return delay(deriveCompetitors());
  },

  async getCompetitor(id) {
    return delay(deriveCompetitors().find((c) => c.id === id) ?? null);
  },

  async createCompetitor({ name, url }: CreateCompetitorInput) {
    console.log("[mock.createCompetitor] called", { name, url });
    const s = readState();
    const cleanedUrl = url.trim();
    const domain = cleanedUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const idx = s.userCompetitors.length + COMPETITORS.length;
    const id = newId();
    const novo: Competitor = {
      id,
      name: name.trim() || domain,
      domain,
      category: "—",
      color: COLORS[idx % COLORS.length],
      favicon: (name.trim() || domain).slice(0, 1).toUpperCase(),
      monitoring: true,
      traffic: 0,
      trafficDelta: 0,
      seoKeywords: 0,
      seoDelta: 0,
      pricingTier: "—",
      lastChange: "Na fila",
      changeType: "content",
      changeSummary: "Crawl inicial em andamento",
      changeSeverity: "low",
      description: "Adicionado por você. Aguardando primeiro crawl.",
      health: 0,
      trafficSeries: [0, 0, 0, 0, 0, 0, 0],
      keywordsTop: [],
      crawlStatus: "queued",
      crawlError: null,
      crawlStartedAt: new Date().toISOString(),
    };
    s.userCompetitors = [novo, ...s.userCompetitors];
    scheduleCrawl(s, id);
    writeState(s);
    console.log(
      "[mock.createCompetitor] persisted",
      { id, name: novo.name, domain: novo.domain },
      "userCompetitors total:",
      s.userCompetitors.length,
    );
    return delay(novo);
  },

  async toggleCompetitorStatus(id: string) {
    const s = readState();
    const all = deriveCompetitors();
    const target = all.find((c) => c.id === id);
    if (!target) throw new Error("Competitor não encontrado");
    if (s.pausedIds.includes(id)) s.pausedIds = s.pausedIds.filter((x) => x !== id);
    else s.pausedIds = [...s.pausedIds, id];
    writeState(s);
    return delay({
      ...target,
      monitoring: !s.pausedIds.includes(id),
    } as Competitor);
  },

  async deleteCompetitor(id: string) {
    const s = readState();
    const seedExists = COMPETITORS.some((c) => c.id === id);
    if (seedExists) {
      s.deletedSeedIds = [...new Set([...s.deletedSeedIds, id])];
    } else {
      s.userCompetitors = s.userCompetitors.filter((c) => c.id !== id);
    }
    delete s.crawlJobs[id];
    delete s.snapshots[id];
    writeState(s);
    return delay(undefined as void);
  },

  async triggerCrawl(id: string) {
    const s = readState();
    const existing = s.crawlJobs[id];
    if (existing) {
      const cur = currentJobStatus(existing);
      if (cur.status === "queued" || cur.status === "running") {
        throw new Error("Crawl já em andamento");
      }
    }
    scheduleCrawl(s, id);
    writeState(s);
    return delay(
      { ok: true as const, queuedAt: new Date().toISOString() },
      400,
    );
  },

  async listAlerts() {
    const s = readState();
    const list = ALERTS.map((a) => ({
      ...a,
      // not part of Alert type, but we expose via metadata path; mark via title presence
    }));
    void s;
    return delay(list);
  },

  async markAlertRead(id: string) {
    const s = readState();
    s.alertsRead = [...new Set([...s.alertsRead, id])];
    writeState(s);
    return delay(undefined as void);
  },

  async getSwot(_competitorId: string) {
    return delay(SWOT);
  },

  async generateSwot(_competitorId: string): Promise<Swot> {
    // simula chamada LLM longa
    return delay(SWOT, SWOT_GEN_LATENCY_MS);
  },

  async getLlmSettings() {
    return delay(readState().llm);
  },

  async setLlmProvider(provider: LLMProviderId) {
    const s = readState();
    s.llm = { ...s.llm, provider };
    writeState(s);
    return delay(s.llm);
  },

  async setLlmModel(useCase: LLMUseCase, modelId: string | null) {
    const s = readState();
    s.llm = {
      ...s.llm,
      ...(useCase === "classification"
        ? { modelClassification: modelId }
        : { modelSwot: modelId }),
    };
    writeState(s);
    return delay(s.llm, 150);
  },

  async saveLlmKey(provider: LLMProviderId, key: string) {
    const s = readState();
    if (provider === "lovable") return delay(s.llm);
    const trimmed = key.trim();
    if (!trimmed || trimmed.length < 8) throw new Error("Chave inválida");
    const keyHint = trimmed.slice(-4);
    s.llm = {
      ...s.llm,
      hasKeyByProvider: {
        ...s.llm.hasKeyByProvider,
        [provider]: { keyHint, createdAt: new Date().toISOString() },
      },
    };
    writeState(s);
    return delay(s.llm, 800);
  },

  async deleteLlmKey(provider: LLMProviderId) {
    const s = readState();
    if (provider === "lovable") return delay(s.llm);
    const next = { ...s.llm.hasKeyByProvider };
    delete next[provider];
    s.llm = { ...s.llm, hasKeyByProvider: next };
    writeState(s);
    return delay(s.llm);
  },

  async listScraperKeys(): Promise<ScraperKeyInfo[]> {
    const s = readState();
    const providers: ScraperProviderId[] = ["firecrawl", "scrapecreators"];
    return delay(
      providers.map((p) => {
        const k = s.scraperKeys[p];
        return {
          provider: p,
          configured: !!k,
          keyHint: k?.keyHint ?? null,
          source: k?.source ?? null,
          updatedAt: k?.updatedAt ?? null,
        };
      }),
      120,
    );
  },

  async saveScraperKey(
    provider: ScraperProviderId,
    key: string,
    source: ScraperKeySource = "manual",
  ): Promise<ScraperKeyInfo> {
    const trimmed = key.trim();
    if (!trimmed || trimmed.length < 8) throw new Error("Chave inválida");
    const s = readState();
    const updatedAt = new Date().toISOString();
    s.scraperKeys = {
      ...s.scraperKeys,
      [provider]: {
        keyHint: trimmed.slice(-4),
        source,
        updatedAt,
        plain: trimmed,
      },
    };
    writeState(s);
    return delay(
      {
        provider,
        configured: true,
        keyHint: trimmed.slice(-4),
        source,
        updatedAt,
      },
      400,
    );
  },

  async deleteScraperKey(provider: ScraperProviderId): Promise<void> {
    const s = readState();
    const next = { ...s.scraperKeys };
    delete next[provider];
    s.scraperKeys = next;
    writeState(s);
    return delay(undefined as void, 200);
  },

  async testScraperKey(
    provider: ScraperProviderId,
    keyOverride?: string,
  ): Promise<ScraperTestResult> {
    const s = readState();
    const key = keyOverride?.trim() || s.scraperKeys[provider]?.plain;
    if (!key || key.length < 8) {
      return delay({ ok: false as const, error: "Chave não configurada" }, 200);
    }
    // mock always succeeds
    return delay({ ok: true as const, latencyMs: 220 }, 600);
  },

  // ----- Ads (Meta + Google via ScrapeCreators) -----
  // ----- Ads link suggestions (mock só pros seeds) -----
  async getAdsLinkSuggestion(competitorId: string) {
    const map: Record<
      string,
      {
        facebookPageId: string | null;
        googleAdvertiserId: string | null;
        confidence: { meta: number; google: number };
        reasoning: string;
      }
    > = {
      rdstation: {
        facebookPageId: "rdstation",
        googleAdvertiserId: "AR12345001",
        confidence: { meta: 0.96, google: 0.83 },
        reasoning:
          "Page 'rdstation' tem 280k seguidores e bate com domain rdstation.com; advertiser AR12345001 tem 600+ ads ativos no Brasil com nome RD Station.",
      },
      pipedrive: {
        facebookPageId: "Pipedrive",
        googleAdvertiserId: "AR98765432",
        confidence: { meta: 0.99, google: 0.94 },
        reasoning:
          "Page oficial verificada com badge azul, link cruzado com pipedrive.com no website. Advertiser bate exatamente.",
      },
      hubspot: {
        facebookPageId: "hubspot",
        googleAdvertiserId: "AR55512345",
        confidence: { meta: 0.99, google: 0.97 },
        reasoning:
          "Brand global verificada; advertiser com volume massivo de ads alinhado ao perfil HubSpot.",
      },
      ploomes: {
        facebookPageId: "ploomes",
        googleAdvertiserId: null,
        confidence: { meta: 0.91, google: 0.32 },
        reasoning:
          "Page bate com ploomes.com. Sem advertiser claro no Google — possível baixo investimento em search ou conta indireta via agência.",
      },
      agendor: {
        facebookPageId: "agendor",
        googleAdvertiserId: null,
        confidence: { meta: 0.88, google: 0.18 },
        reasoning: "FB encontrado via footer do site. Google não retornou match relevante.",
      },
    };
    const data = map[competitorId];
    if (!data)
      return delay(null as Awaited<ReturnType<DataProvider["getAdsLinkSuggestion"]>>, 200);
    return delay(
      {
        facebookPageId: data.facebookPageId,
        googleAdvertiserId: data.googleAdvertiserId,
        confidence: data.confidence,
        reasoning: data.reasoning,
        suggestedAt: new Date().toISOString(),
      },
      300,
    );
  },

  async triggerSuggestAdsLinks(competitorId: string) {
    // Simula ~2s de Edge Function rodando (regex + scrapecreators + LLM)
    return mockProvider.getAdsLinkSuggestion(competitorId).then((s) =>
      new Promise<typeof s>((resolve) =>
        setTimeout(() => resolve(s), 1800),
      ),
    );
  },

  // ----- Snapshots -----
  async getLatestSnapshot(competitorId: string): Promise<Snapshot | null> {
    // garante derive (que pode popular snapshots se faltar)
    deriveCompetitors();
    const s = readState();
    const list = s.snapshots[competitorId] ?? [];
    return delay(list[0] ?? null, 150);
  },

  async listSnapshots(competitorId: string, limit: number = 20): Promise<Snapshot[]> {
    deriveCompetitors();
    const s = readState();
    const list = s.snapshots[competitorId] ?? [];
    return delay(list.slice(0, limit), 200);
  },

  // A timeline simulada usa a mesma forma que a API devolve depois de
  // adaptada, para que a aba nao precise saber qual provider esta ativo.
  async listChanges(
    competitorId: string,
    limit: number = 50,
  ): Promise<CompetitorChange[]> {
    const itens = TIMELINE_RD.slice(0, limit).map((it, i) => ({
      id: `${competitorId}-mock-${i}`,
      competitorId,
      detectedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      date: it.date,
      type: it.type,
      severity: it.severity,
      label: it.label,
      diff: null,
    }));
    return delay(itens, 200);
  },

  async listAds(competitorId: string): Promise<Ad[]> {
    // No mock, retorna ads pré-fabricados pros 5 seeds. Para qualquer
    // competitor user-created (id começando com c_) retorna [].
    const list = ADS.filter((a) => a.competitor === competitorId);
    return delay(list, 200);
  },

  async triggerFetchAds(_id: string, options?: { withDetails?: boolean }) {
    // Simula latência de fetch via ScrapeCreators
    return delay(
      {
        ok: true as const,
        queuedAt: new Date().toISOString(),
        metaCount: 3,
        googleCount: 2,
        withDetails: options?.withDetails === true,
        sources: { meta: "demo", google: "demo" },
        notes: [],
      },
      900,
    );
  },

  async linkCompetitorAds(
    competitorId: string,
    input: { facebookPageId?: string | null; googleAdvertiserId?: string | null },
  ) {
    const s = readState();
    const prev = s.adsLinks[competitorId] ?? {};
    s.adsLinks[competitorId] = {
      facebookPageId:
        input.facebookPageId === undefined
          ? prev.facebookPageId
          : input.facebookPageId,
      googleAdvertiserId:
        input.googleAdvertiserId === undefined
          ? prev.googleAdvertiserId
          : input.googleAdvertiserId,
    };
    writeState(s);
    return delay(undefined as void, 200);
  },
};

// also referenced by alerts list helper
export function isAlertRead(id: string): boolean {
  return readState().alertsRead.includes(id);
}
