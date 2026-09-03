// Re-export domain types from ic-mock so the data layer has a stable contract
// even when mock data goes away.
export type {
  Competitor,
  Alert,
  Swot,
  SwotItem,
  KeywordRow,
  TimelineItem,
  ChangeType,
  Severity,
  Ad,
  AdSource,
  AdCreative,
  AdSpendEstimate,
  AdTargeting,
  Snapshot,
  SnapshotStructuredData,
  AdsLinkSuggestion,
} from "@/lib/ic-mock";

export type LLMProviderId = "lovable" | "anthropic" | "openai" | "gemini";

export type LLMUseCase = "classification" | "swot";

export type LLMModelOption = {
  id: string;
  label: string;
  description?: string;
  recommendedFor?: LLMUseCase[];
};

export type LLMSettings = {
  provider: LLMProviderId;
  modelClassification: string | null;
  modelSwot: string | null;
  hasKeyByProvider: Partial<
    Record<
      LLMProviderId,
      {
        keyHint: string;
        /** Null quando a chave e a do projeto -- ninguem a "cadastrou". */
        createdAt: string | null;
        source: "usuario" | "projeto";
      }
    >
  >;
};

/**
 * Uma mudanca detectada entre dois crawls consecutivos -- o conteudo da aba
 * "Timeline de mudancas".
 *
 * A tabela `changes` existia desde o inicio e era escrita a cada crawl, mas
 * nenhuma rota a lia: a Timeline mostrava dados fixos de vitrine ou um estado
 * vazio permanente. Este tipo e o contrato que fechou esse circuito.
 */
export type CompetitorChange = {
  id: string;
  competitorId: string;
  detectedAt: string;
  /** Ja formatado em dd/mm para a coluna da esquerda da timeline. */
  date: string;
  type: import("@/lib/ic-mock").ChangeType;
  severity: import("@/lib/ic-mock").Severity;
  label: string;
  diff: Record<string, unknown> | null;
};

/** Membro do time, como `GET /team/members` devolve. */
export type TeamMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
};

/** Convite pendente ou aceito, de `GET /team/invites`. */
export type TeamInvite = {
  id: string;
  email: string;
  created_at: string;
  accepted_at: string | null;
};

export type CreateCompetitorInput = {
  name: string;
  url: string;
};

// Scraper providers (BYOK — each user brings their own API key).
// MVP: apenas firecrawl (landing page) + scrapecreators (Meta + Google ads).
// scrapfly e similarweb foram removidos — a mudança no schema acontece
// no PR Lovable (lovable-ads-monitoring-prompt.md).
export type ScraperProviderId = "firecrawl" | "scrapecreators";

// "projeto" nao e uma chave que o usuario cadastrou: e a chave do `.env` do
// servico, que `coletores.chave()` usa como piso. Existe para a tela poder
// dizer "ativo pela chave do projeto" em vez de "nao configurado".
export type ScraperKeySource = "manual" | "lovable_connector" | "projeto";

export type ScraperKeyInfo = {
  provider: ScraperProviderId;
  configured: boolean;
  keyHint: string | null;
  source: ScraperKeySource | null;
  updatedAt: string | null;
};

export type ScraperTestResult =
  | { ok: true; latencyMs?: number; meta?: Record<string, unknown> }
  | { ok: false; error: string };

export type DataProvider = {
  // competitors
  listCompetitors(): Promise<import("@/lib/ic-mock").Competitor[]>;
  getCompetitor(id: string): Promise<import("@/lib/ic-mock").Competitor | null>;
  createCompetitor(input: CreateCompetitorInput): Promise<import("@/lib/ic-mock").Competitor>;
  toggleCompetitorStatus(id: string): Promise<import("@/lib/ic-mock").Competitor>;
  deleteCompetitor(id: string): Promise<void>;
  triggerCrawl(id: string): Promise<{ ok: true; queuedAt: string }>;

  // alerts
  listAlerts(): Promise<import("@/lib/ic-mock").Alert[]>;
  markAlertRead(id: string): Promise<void>;

  // swot
  getSwot(competitorId: string): Promise<import("@/lib/ic-mock").Swot>;
  generateSwot(competitorId: string): Promise<import("@/lib/ic-mock").Swot>;

  // llm settings
  getLlmSettings(): Promise<LLMSettings>;
  setLlmProvider(provider: LLMProviderId): Promise<LLMSettings>;
  setLlmModel(useCase: LLMUseCase, modelId: string | null): Promise<LLMSettings>;
  saveLlmKey(provider: LLMProviderId, key: string): Promise<LLMSettings>;
  deleteLlmKey(provider: LLMProviderId): Promise<LLMSettings>;

  // scraper keys (BYOK)
  listScraperKeys(): Promise<ScraperKeyInfo[]>;
  saveScraperKey(
    provider: ScraperProviderId,
    key: string,
    source?: ScraperKeySource,
  ): Promise<ScraperKeyInfo>;
  deleteScraperKey(provider: ScraperProviderId): Promise<void>;
  testScraperKey(
    provider: ScraperProviderId,
    keyOverride?: string,
  ): Promise<ScraperTestResult>;

  // snapshots (resultado do crawl Firecrawl)
  getLatestSnapshot(
    competitorId: string,
  ): Promise<import("@/lib/ic-mock").Snapshot | null>;
  listSnapshots(
    competitorId: string,
    limit?: number,
  ): Promise<import("@/lib/ic-mock").Snapshot[]>;

  // mudancas detectadas entre crawls (aba Timeline)
  listChanges(
    competitorId: string,
    limit?: number,
  ): Promise<CompetitorChange[]>;

  // ----- SEO (analise por IA a partir do ultimo snapshot) -----
  // Estava fora do contrato: o hook chamava `apiFetch` direto. Consequencia
  // concreta -- no modo demonstracao a aba nao tinha dado simulado e se
  // comportava diferente do resto do painel.
  getSeoAnalysis(
    competitorId: string,
  ): Promise<import("@/lib/data/hooks/use-seo-analysis").SeoAnalysis | null>;
  generateSeoAnalysis(
    competitorId: string,
  ): Promise<import("@/lib/data/hooks/use-seo-analysis").SeoAnalysis>;

  // ----- Redes sociais (Instagram via ScrapeCreators) -----
  getLatestSocialSnapshot(
    competitorId: string,
    platform: import("@/lib/social/types").SocialPlatform,
  ): Promise<import("@/lib/social/types").SocialSnapshot | null>;
  getSocialAnalysis(
    competitorId: string,
    platform: import("@/lib/social/types").SocialPlatform,
  ): Promise<import("@/lib/social/types").SocialAnalysis | null>;
  fetchSocial(
    competitorId: string,
    platform: import("@/lib/social/types").SocialPlatform,
  ): Promise<import("@/lib/social/types").FetchSocialResult>;
  analyzeSocial(
    competitorId: string,
    platform: import("@/lib/social/types").SocialPlatform,
  ): Promise<
    { ok: true; analysisId: string | null } | { ok: false; error: string; status?: number }
  >;
  getInstagramHandles(
    competitorId: string,
  ): Promise<{ handle: string | null; suggestion: string | null; lastFetchedAt: string | null }>;
  setInstagramHandle(competitorId: string, handle: string | null): Promise<void>;

  // ----- Time e convites -----
  listTeamMembers(): Promise<TeamMember[]>;
  listInvites(): Promise<TeamInvite[]>;
  createInvite(email: string): Promise<{ id: string; email: string }>;
  deleteInvite(inviteId: string): Promise<void>;

  // ads (Meta + Google via ScrapeCreators)
  listAds(competitorId: string): Promise<import("@/lib/ic-mock").Ad[]>;
  triggerFetchAds(
    competitorId: string,
    options?: { withDetails?: boolean },
  ): Promise<{
    ok: true;
    queuedAt: string;
    metaCount?: number;
    googleCount?: number;
    notes?: string[];
    sources?: { meta?: string; google?: string };
    withDetails?: boolean;
  }>;
  linkCompetitorAds(
    competitorId: string,
    input: { facebookPageId?: string | null; googleAdvertiserId?: string | null },
  ): Promise<void>;

  // sugestões automáticas (regex + ScrapeCreators search + LLM)
  getAdsLinkSuggestion(
    competitorId: string,
  ): Promise<import("@/lib/ic-mock").AdsLinkSuggestion | null>;
  triggerSuggestAdsLinks(
    competitorId: string,
  ): Promise<import("@/lib/ic-mock").AdsLinkSuggestion | null>;
};
