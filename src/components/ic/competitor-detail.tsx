import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Check,
  Inbox,
  Plug,
  FlaskConical,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useTriggerCrawl } from "@/lib/data/hooks/use-competitors";
import { toastDataError } from "@/lib/data/error-toast";

import { cn } from "@/lib/utils";
import { fmtTraffic, fmtDelta } from "@/lib/formatters";
import {
  TIMELINE_RD,
  KEYWORDS_OVERLAP,
  COMPETITORS as SEED_COMPETITORS,
  type Competitor,
  type Severity,
} from "@/lib/ic-mock";

import { CompetitorFavicon } from "./competitor-favicon";
import { CrawlStatusBadge } from "./crawl-status-badge";
import { Sparkline } from "./sparkline";
import { AIBadge } from "./ai-badge";
import { ChangeTypeIcon } from "./change-type-icon";
import { MockScreenshot } from "./mock-screenshot";
import { AdsTab } from "./ads-tab";
import { LinkAdsDialog } from "./link-ads-dialog";
import { SocialTab } from "./social-tab";
import { useLatestSnapshot, useSnapshots } from "@/lib/data/hooks/use-snapshots";
import { useChanges } from "@/lib/data/hooks/use-changes";
import { SeoAiAnalysis } from "./seo-ai-analysis";
import type { Snapshot } from "@/lib/ic-mock";

type Props = {
  comp: Competitor;
  onBack: () => void;
  onShowCrawlError?: () => void;
};

// True só pros 5 mock seeds (RD/Pipedrive/HubSpot/Ploomes/Agendor) que têm
// dados ricos pré-fabricados. Para qualquer outro competitor (real ou
// user-created sem crawl bem-sucedido) mostramos empty states em vez de
// reaproveitar mock data hardcoded.
/** Data e hora no formato brasileiro. Estava duplicada dentro de um unico
 *  componente; a aba de historico visual precisou da mesma regra. */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSeedWithMockData(comp: Competitor): boolean {
  return SEED_COMPETITORS.some((s) => s.id === comp.id);
}

type TabId =
  | "overview"
  | "ads"
  | "social"
  | "timeline"
  | "screenshots"
  | "seo"
  | "pricing";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "ads", label: "Anúncios" },
  { id: "social", label: "Redes sociais" },
  { id: "timeline", label: "Timeline de mudanças" },
  { id: "screenshots", label: "Histórico visual" },
  { id: "seo", label: "SEO & Keywords" },
  { id: "pricing", label: "Preços" },
];

export function CompetitorDetail({ comp, onBack, onShowCrawlError }: Props) {
  const [tab, setTab] = useState<TabId>("overview");
  const [linkAdsOpen, setLinkAdsOpen] = useState(false);

  const crawlMut = useTriggerCrawl();
  const isCrawling =
    comp.crawlStatus === "queued" ||
    comp.crawlStatus === "running" ||
    crawlMut.isPending;

  const handleSyncCrawl = () => {
    crawlMut.mutate(comp.id, {
      onSuccess: () => toast.success(`Crawl iniciado: ${comp.name}`),
      onError: (err) => toastDataError(err),
    });
  };

  return (
    <>
      <div
        style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: -8 }}
      >
        <button type="button" className="ic-btn ic-btn-ghost" onClick={onBack}>
          <ArrowLeft size={12} />
          Voltar
        </button>
        <CompetitorFavicon comp={comp} size={48} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2
              style={{
                fontSize: 24,
                fontWeight: 900,
                color: "var(--via-navy)",
                letterSpacing: "-0.01em",
              }}
            >
              {comp.name}
            </h2>
            <span className="ic-tag">{comp.category}</span>
            <span className="ic-pill blue">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: comp.monitoring
                    ? "var(--via-success)"
                    : "var(--via-warning)",
                }}
              />
              {comp.monitoring ? "Monitorando" : "Pausado"}
            </span>
            <CrawlStatusBadge competitor={comp} onShowError={onShowCrawlError} />
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--via-color-text-muted)",
              marginTop: 2,
            }}
          >
            <a
              href={`https://${comp.domain}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--via-blue)" }}
            >
              {comp.domain}
            </a>{" "}
            · {comp.description}
          </div>
        </div>
        <button
          type="button"
          className="ic-btn ic-btn-blue"
          onClick={handleSyncCrawl}
          disabled={isCrawling}
          title={isCrawling ? "Crawl em andamento" : "Disparar nova coleta"}
        >
          <RefreshCw
            size={12}
            style={{
              animation: isCrawling ? "ic-spin 1s linear infinite" : undefined,
            }}
          />
          {isCrawling ? "Sincronizando…" : "Sincronizar crawl"}
        </button>
        <button
          type="button"
          className="ic-btn ic-btn-secondary"
          onClick={() => setLinkAdsOpen(true)}
        >
          <Megaphone size={12} />
          Vincular ads
        </button>
        <a
          href={`https://${comp.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ic-btn ic-btn-secondary"
          style={{ textDecoration: "none" }}
        >
          <ExternalLink size={12} />
          Abrir site
        </a>
      </div>


      {/* KPIs */}
      <div className="ic-kpi-strip">
        <div className="ic-kpi">
          <div className="ic-kpi-label">Tráfego mensal</div>
          <div className="ic-kpi-value">{fmtTraffic(comp.traffic)}</div>
          <div
            className={cn("ic-kpi-delta", comp.trafficDelta > 0 ? "up" : "down")}
          >
            {comp.trafficDelta > 0 ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {fmtDelta(comp.trafficDelta)} vs mês anterior
          </div>
          <div className="ic-kpi-spark">
            <Sparkline
              values={comp.trafficSeries}
              color={comp.color}
              width={64}
              height={24}
            />
          </div>
        </div>
        <div className="ic-kpi">
          <div className="ic-kpi-label">Keywords ranqueadas</div>
          <div className="ic-kpi-value">
            {(comp.seoKeywords / 1000).toFixed(1)}k
          </div>
          <div
            className={cn("ic-kpi-delta", comp.seoDelta > 0 ? "up" : "down")}
          >
            {comp.seoDelta > 0 ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {fmtDelta(comp.seoDelta)} novas no mês
          </div>
        </div>
        <div className="ic-kpi">
          <div className="ic-kpi-label">Faixa de preços</div>
          <div className="ic-kpi-value" style={{ fontSize: 22 }}>
            {comp.pricingTier}
          </div>
          <div className="ic-kpi-foot">Última mudança: {comp.lastChange}</div>
        </div>
        <div className="ic-kpi">
          <div className="ic-kpi-label">Health score</div>
          <div className="ic-kpi-value">{comp.health}</div>
          <div style={{ marginTop: 6 }} className="ic-health-bar">
            <div
              className="ic-health-fill"
              style={{
                width: `${comp.health}%`,
                background:
                  comp.health > 85
                    ? "var(--via-success)"
                    : comp.health > 70
                      ? "var(--via-warning)"
                      : "var(--via-danger)",
              }}
            />
          </div>
          <div className="ic-kpi-foot" style={{ marginTop: 4 }}>
            Combinação tráfego + SEO + freshness
          </div>
        </div>
      </div>

      <div className="ic-card" style={{ padding: 0 }}>
        <div className="ic-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn("ic-tab", tab === t.id && "active")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ padding: 24 }}>
          {tab === "overview" && <OverviewTab comp={comp} />}
          {tab === "ads" && <AdsTab comp={comp} />}
          {tab === "social" && <SocialTab comp={comp} />}
          {tab === "timeline" && <TimelineTab comp={comp} />}
          {tab === "screenshots" && <ScreenshotsTab comp={comp} />}
          {tab === "seo" && <SeoTab comp={comp} />}
          {tab === "pricing" && <PricingTab comp={comp} />}
        </div>
      </div>

      {linkAdsOpen && (
        <LinkAdsDialog comp={comp} onClose={() => setLinkAdsOpen(false)} />
      )}
    </>
  );
}

function NoDataYet({
  comp,
  title,
  description,
}: {
  comp: Competitor;
  title: string;
  description: string;
}) {
  const status = comp.crawlStatus ?? "never";
  const showFirecrawlHint =
    status === "never" ||
    status === "failed" ||
    (comp.crawlError ?? "").toLowerCase().includes("firecrawl");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--via-blue-light)",
          color: "var(--via-blue)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Inbox size={24} strokeWidth={1.75} />
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 900,
          color: "var(--via-navy)",
          marginTop: 4,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--via-color-text-muted)",
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>
      {showFirecrawlHint && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link
            to="/settings/integrations"
            className="ic-btn ic-btn-blue"
            style={{ textDecoration: "none" }}
          >
            <Plug size={12} />
            Configurar Firecrawl
          </Link>
          <span
            style={{
              fontSize: 11,
              color: "var(--via-color-text-muted)",
              alignSelf: "center",
              fontStyle: "italic",
            }}
          >
            ou ative{" "}
            <FlaskConical
              size={11}
              style={{ display: "inline", verticalAlign: "middle" }}
            />{" "}
            <strong>Modo Demo</strong> no header pra explorar com dados
            simulados
          </span>
        </div>
      )}
    </div>
  );
}

function RealOverview({
  comp,
  snapshot,
}: {
  comp: Competitor;
  snapshot: Snapshot;
}) {
  const sd = snapshot.structured_data ?? {};
  const prices = Array.isArray(sd.prices) ? sd.prices : [];
  const ctas = Array.isArray(sd.ctas) ? sd.ctas : [];
  const h1 = typeof sd.h1 === "string" ? sd.h1 : null;
  const rawPreview = (snapshot.raw_text ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .slice(0, 700);

  return (
    <div className="ic-grid-main" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
      <div>
        <div className="ic-insight" style={{ marginBottom: 20 }}>
          <div className="ic-insight-mark">
            <Sparkles size={14} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <div className="ic-insight-title">
                Última coleta · {fmtDate(snapshot.crawled_at)}
              </div>
              <AIBadge>{snapshot.source}</AIBadge>
            </div>
            <div className="ic-insight-body">
              {h1 ? (
                <>
                  <strong style={{ color: "var(--via-navy)" }}>
                    Headline:
                  </strong>{" "}
                  {h1}
                  <br />
                </>
              ) : null}
              {rawPreview ? (
                <span style={{ whiteSpace: "pre-wrap" }}>
                  {rawPreview}
                  {(snapshot.raw_text?.length ?? 0) > 700 ? "…" : ""}
                </span>
              ) : (
                "Sem texto extraído neste snapshot."
              )}
            </div>
          </div>
        </div>

        {prices.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: "var(--via-navy)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 12,
              }}
            >
              Preços detectados
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {prices.map((p) => (
                <span key={p} className="ic-pill blue" style={{ fontSize: 12 }}>
                  {p}
                </span>
              ))}
            </div>
          </section>
        )}

        {ctas.length > 0 && (
          <section>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: "var(--via-navy)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 12,
              }}
            >
              CTAs detectados
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ctas.map((c) => (
                <span key={c} className="ic-tag">
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            border: "1px solid var(--via-navy-15)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.12em",
              color: "var(--via-color-text-muted)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Metadados do snapshot
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
            <Row label="Coletado em" value={fmtDate(snapshot.crawled_at)} />
            <Row label="Fonte" value={snapshot.source} />
            <Row
              label="Tamanho do markdown"
              value={
                snapshot.raw_text
                  ? `${snapshot.raw_text.length.toLocaleString("pt-BR")} caracteres`
                  : "—"
              }
            />
            <Row
              label="Custo"
              value={
                snapshot.cost_cents != null
                  ? `${(snapshot.cost_cents / 100).toFixed(2)} crédito${snapshot.cost_cents === 100 ? "" : "s"}`
                  : "—"
              }
            />
          </div>
        </div>
        <div
          style={{
            border: "1px solid var(--via-navy-15)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.12em",
              color: "var(--via-color-text-muted)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Próximos passos
          </div>
          <div style={{ fontSize: 12, color: "var(--via-color-text-body)", lineHeight: 1.6 }}>
            Após o segundo crawl bem-sucedido a aba <strong>Timeline</strong> mostrará as mudanças detectadas. Os screenshots aparecem no <strong>Histórico visual</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        borderBottom: "1px dashed var(--via-navy-15)",
        paddingBottom: 6,
      }}
    >
      <span style={{ color: "var(--via-color-text-muted)" }}>{label}</span>
      <span style={{ color: "var(--via-navy)", fontWeight: 700, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function OverviewTab({ comp }: { comp: Competitor }) {
  const hasMock = isSeedWithMockData(comp);
  const snapshotQ = useLatestSnapshot(comp.id);
  const snapshot = snapshotQ.data;

  // Sem snapshot E sem dados mock → empty state
  if (!hasMock && !snapshot) {
    if (snapshotQ.isLoading) {
      return (
        <div
          style={{ minHeight: 320, opacity: 0.4 }}
          className="ic-card"
          aria-label="Carregando snapshot"
        />
      );
    }
    return (
      <NoDataYet
        comp={comp}
        title="Sem dados ainda para esta página"
        description="Quando o primeiro crawl rodar com sucesso, mostraremos aqui a síntese de posicionamento gerada por IA, as últimas mudanças detectadas, top keywords e stack tecnológica."
      />
    );
  }

  // Sem mock mas com snapshot real → renderiza versão "real"
  if (!hasMock && snapshot) {
    return <RealOverview comp={comp} snapshot={snapshot} />;
  }

  return (
    <div className="ic-grid-main" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
      <div>
        <div className="ic-insight" style={{ marginBottom: 20 }}>
          <div className="ic-insight-mark">
            <Sparkles size={14} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <div className="ic-insight-title">Síntese de posicionamento</div>
              <AIBadge>IA · 96% confiança</AIBadge>
            </div>
            <div className="ic-insight-body">
              {comp.name} se posiciona como {comp.description.toLowerCase()} O
              movimento mais relevante do trimestre é{" "}
              <strong style={{ color: "var(--via-navy)" }}>
                {comp.changeSummary.toLowerCase()}
              </strong>
              . A página de preços foi a área com maior número de alterações —
              sinal de que o time comercial está testando posicionamento de
              valor. Cobertura de IA <strong>cresceu 4x</strong> em 60 dias.
            </div>
          </div>
        </div>

        <h3
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: "var(--via-navy)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 12,
          }}
        >
          Últimas mudanças detectadas
        </h3>
        <div className="ic-timeline">
          {TIMELINE_RD.slice(0, 5).map((it, i) => (
            <div key={i} className={cn("ic-tl-item", it.severity)}>
              <div className="ic-tl-date">
                {it.date} ·{" "}
                <span style={{ color: severityColor(it.severity) }}>
                  {it.type}
                </span>
              </div>
              <div className="ic-tl-label">{it.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            border: "1px solid var(--via-navy-15)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.12em",
              color: "var(--via-color-text-muted)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Top keywords (orgânico)
          </div>
          {comp.keywordsTop.length === 0 ? (
            <div
              style={{ fontSize: 12, color: "var(--via-color-text-muted)" }}
            >
              Nenhuma keyword detectada ainda
            </div>
          ) : (
            comp.keywordsTop.map((k, i) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom:
                    i < comp.keywordsTop.length - 1
                      ? "1px dashed var(--via-navy-15)"
                      : "none",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--via-navy)" }}>
                  {k}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: "var(--via-blue)",
                  }}
                >
                  #{i + 1}
                </span>
              </div>
            ))
          )}
        </div>
        <div
          style={{
            border: "1px solid var(--via-navy-15)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.12em",
              color: "var(--via-color-text-muted)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Stack detectada
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              "Next.js",
              "Vercel",
              "HubSpot Forms",
              "Segment",
              "Intercom",
              "Stripe",
              "Algolia",
            ].map((s) => (
              <span key={s} className="ic-tag">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mostra o `diff` que o comparador gravou junto da mudanca.
 *
 * O formato vem de `coletores.comparar()`: sempre tem `field`, e conforme o
 * campo traz `from`/`to` (h1, titulo) ou `added`/`removed` (precos, CTAs).
 * Qualquer outra forma cai no JSON cru em vez de sumir da tela.
 */
function DiffDaMudanca({ diff }: { diff: Record<string, unknown> | null }) {
  if (!diff) return null;
  const de = diff.from as string | undefined;
  const para = diff.to as string | undefined;
  const entraram = diff.added as string[] | undefined;
  const sairam = diff.removed as string[] | undefined;

  if (de === undefined && para === undefined && !entraram && !sairam) {
    return (
      <pre
        style={{
          marginTop: 8,
          fontSize: 11,
          background: "var(--via-bg-2)",
          padding: 10,
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        {JSON.stringify(diff, null, 2)}
      </pre>
    );
  }

  return (
    <div className="ic-diff" style={{ marginTop: 8 }}>
      <div>
        <span className="ic-diff-label">Antes</span>
        {de !== undefined && de !== "" ? de : null}
        {sairam?.length ? sairam.join(" · ") : null}
        {de === undefined && !sairam?.length ? (
          <em style={{ color: "var(--via-color-text-muted)" }}>nada</em>
        ) : null}
      </div>
      <div>
        <span className="ic-diff-label">Depois</span>
        <strong>
          {para !== undefined && para !== "" ? para : null}
          {entraram?.length ? entraram.join(" · ") : null}
        </strong>
        {para === undefined && !entraram?.length ? (
          <em style={{ color: "var(--via-color-text-muted)" }}>nada</em>
        ) : null}
      </div>
    </div>
  );
}

function TimelineTab({ comp }: { comp: Competitor }) {
  // Le `public.changes` de verdade. Ate 03/09 esta aba tinha apenas dois
  // estados -- vitrine fixa para os concorrentes-semente, ou "aguardando"
  // para todo o resto -- e nenhum crawl, em nenhuma quantidade, mudava isso.
  const changesQ = useChanges(comp.id);
  const itens = changesQ.data ?? [];

  if (changesQ.isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--via-color-text-muted)", fontSize: 13 }}>
        Carregando mudanças…
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <NoDataYet
        comp={comp}
        title="Nenhuma mudança detectada ainda"
        description="A timeline compara cada crawl com o anterior. Enquanto o conteúdo da página não mudar, não há o que listar aqui — um site estável fica com esta aba vazia, e isso é o resultado correto. O crawl automático roda todo dia às 03h50."
      />
    );
  }

  return (
    <div className="ic-timeline">
      {itens.map((it) => (
        <div key={it.id} className={cn("ic-tl-item", it.severity)}>
          <div className="ic-tl-date">{it.date}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span className={cn("ic-pill", it.severity)}>
              <ChangeTypeIcon type={it.type} size={10} />
              {it.type}
            </span>
            <span className="ic-tl-label" style={{ fontWeight: 700 }}>
              {it.label}
            </span>
          </div>
          <DiffDaMudanca diff={it.diff} />
        </div>
      ))}
    </div>
  );
}

function ScreenshotsTab({ comp }: { comp: Competitor }) {
  // Lista os snapshots de verdade. A imagem em si ainda nao existe: o
  // `screenshot_path` fica NULL porque nao ha onde guardar o PNG nesta
  // instalacao -- a edge function da Lovable subia para o Storage da
  // Supabase, que nao veio junto. O texto abaixo diz isso em vez de
  // prometer captura.
  const snapsQ = useSnapshots(comp.id, 30);
  const snaps = snapsQ.data ?? [];
  const temImagem = snaps.some((s) => Boolean(s.screenshot_path));

  if (!isSeedWithMockData(comp)) {
    if (snapsQ.isLoading) {
      return (
        <div style={{ padding: 40, textAlign: "center", color: "var(--via-color-text-muted)", fontSize: 13 }}>
          Carregando histórico…
        </div>
      );
    }
    if (snaps.length === 0) {
      return (
        <NoDataYet
          comp={comp}
          title="Nenhuma coleta ainda"
          description="Cada crawl guarda uma versão do conteúdo da página. Assim que a primeira coleta terminar, ela aparece aqui."
        />
      );
    }
    return (
      <div>
        <div style={{ marginBottom: 16, fontSize: 13, color: "var(--via-color-text-muted)" }}>
          <strong style={{ color: "var(--via-navy)" }}>
            {snaps.length} {snaps.length === 1 ? "coleta" : "coletas"}
          </strong>{" "}
          registradas
          {!temImagem ? (
            <>
              {" "}· sem captura de imagem: este ambiente ainda não tem onde
              guardar o PNG, então o histórico é de conteúdo, não visual
            </>
          ) : null}
        </div>
        <div className="ic-timeline">
          {snaps.map((snap) => (
            <div key={snap.id} className="ic-tl-item low">
              <div className="ic-tl-date">{fmtDate(snap.crawled_at)}</div>
              <div className="ic-tl-label">
                {snap.structured_data?.h1 ?? "sem H1 na página"}
                {snap.structured_data?.prices?.length ? (
                  <> · preços: {snap.structured_data.prices.join(" · ")}</>
                ) : null}
              </div>
              {snap.screenshot_path ? (
                <img
                  src={snap.screenshot_path}
                  alt={`Captura de ${comp.name} em ${fmtDate(snap.crawled_at)}`}
                  style={{ marginTop: 8, maxWidth: "100%", borderRadius: 8 }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }
  const dates = ["24/04", "17/04", "10/04", "03/04"];
  const variants: Array<"home" | "pricing" | "features"> = [
    "home",
    "pricing",
    "features",
    "home",
  ];
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--via-color-text-muted)" }}>
          <strong style={{ color: "var(--via-navy)" }}>4 capturas</strong> nos
          últimos 30 dias · próxima captura em 14h
        </div>
      </div>
      <div className="ic-shots">
        {dates.map((d, i) => (
          <div key={d} className="ic-shot">
            <MockScreenshot
              comp={comp}
              variant={variants[i]}
              highlight={i === 0 ? 3 : null}
            />
            <div className="ic-shot-foot">
              <span className="ic-shot-date">{d}</span>
              <span className="ic-shot-tag">{variants[i]}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: "var(--via-navy)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 12,
          }}
        >
          Diff detectado · página inicial
        </h3>
        <div className="ic-diff">
          <div>
            <span className="ic-diff-label">17/04 · Headline anterior</span>
            "A plataforma de marketing digital líder do Brasil"
            <br />
            <span style={{ color: "var(--via-color-text-muted)", fontSize: 12 }}>
              CTA principal: <em>Teste grátis por 10 dias</em>
            </span>
          </div>
          <div>
            <span className="ic-diff-label">24/04 · Headline atual</span>
            <strong>"O CRM com IA que transforma seu time de vendas"</strong>
            <br />
            <span style={{ color: "var(--via-color-text-muted)", fontSize: 12 }}>
              CTA principal: <em>Agendar demonstração</em>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeoTab({ comp }: { comp: Competitor }) {
  if (!isSeedWithMockData(comp)) {
    return (
      <div>
        <SeoAiAnalysis comp={comp} />
        <NoDataYet
          comp={comp}
          title="Comparativo de keywords em construção"
          description="A comparação de posições orgânicas (você vs concorrente) está em roadmap. Acima, a análise SEO por IA já está disponível a partir do último crawl."
        />
      </div>
    );
  }
  const compKey: keyof (typeof KEYWORDS_OVERLAP)[number] =
    comp.id === "rdstation"
      ? "rd"
      : comp.id === "pipedrive"
        ? "pipe"
        : comp.id === "hubspot"
          ? "hub"
          : comp.id === "ploomes"
            ? "ploo"
            : "agen";
  return (
    <div>
      <SeoAiAnalysis comp={comp} />
      <h3
        style={{
          fontSize: 14,
          fontWeight: 900,
          color: "var(--via-navy)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: 14,
        }}
      >
        Posições orgânicas — palavras-chave estratégicas
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Keyword", "Volume", "Você", comp.name, "Tendência"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "10px 8px",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: "var(--via-color-text-muted)",
                  textTransform: "uppercase",
                  borderBottom: "1px solid var(--via-navy-15)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KEYWORDS_OVERLAP.map((k) => {
            const compPos = k[compKey] as number;
            const ourBetter = k.ours < compPos;
            return (
              <tr key={k.keyword}>
                <td
                  style={{
                    padding: "12px 8px",
                    fontSize: 13,
                    color: "var(--via-navy)",
                    borderBottom: "1px solid var(--via-navy-15)",
                  }}
                >
                  {k.keyword}
                </td>
                <td
                  style={{
                    padding: "12px 8px",
                    fontSize: 12,
                    color: "var(--via-color-text-muted)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    borderBottom: "1px solid var(--via-navy-15)",
                  }}
                >
                  {k.volume.toLocaleString("pt-BR")}
                </td>
                <td
                  style={{
                    padding: "12px 8px",
                    textAlign: "center",
                    borderBottom: "1px solid var(--via-navy-15)",
                  }}
                >
                  <span className={cn("ic-rank-pos", "us")}>#{k.ours}</span>
                </td>
                <td
                  style={{
                    padding: "12px 8px",
                    textAlign: "center",
                    borderBottom: "1px solid var(--via-navy-15)",
                  }}
                >
                  <span className="ic-rank-pos">#{compPos}</span>
                </td>
                <td
                  style={{
                    padding: "12px 8px",
                    borderBottom: "1px solid var(--via-navy-15)",
                  }}
                >
                  <span
                    className={cn(
                      "ic-pill",
                      ourBetter ? "success" : compPos < 5 ? "high" : "low",
                    )}
                  >
                    {ourBetter
                      ? "↑ Você lidera"
                      : compPos < 5
                        ? `↓ ${comp.name} lidera`
                        : "Empate fraco"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Plan = {
  name: string;
  price: string;
  features: string[];
  highlight?: boolean;
  badge?: string;
};

function PricingTab({ comp }: { comp: Competitor }) {
  if (!isSeedWithMockData(comp)) {
    return (
      <NoDataYet
        comp={comp}
        title="Comparativo de planos em roadmap"
        description="Os preços que detectamos no snapshot aparecem na aba 'Visão geral'. Aqui ficará a comparação plano-a-plano (Light vs Pro vs Enterprise) com diff entre crawls — em construção."
      />
    );
  }
  const plans: Plan[] =
    comp.id === "rdstation"
      ? [
          {
            name: "Light",
            price: "R$ 79",
            features: ["CRM básico", "Funil único", "E-mail tracking"],
          },
          {
            name: "Pro",
            price: "R$ 199",
            features: [
              "CRM avançado",
              "IA generativa",
              "3.000 leads",
              "WhatsApp Business",
            ],
            highlight: true,
            badge: "NOVO",
          },
          {
            name: "Marketing",
            price: "R$ 349",
            features: [
              "Tudo do Pro",
              "Automação de marketing",
              "Landing pages",
              "Lead scoring",
            ],
          },
        ]
      : [
          {
            name: "Essential",
            price: "US$ 14",
            features: ["Pipeline básico", "3.000 deals"],
          },
          {
            name: "Advanced",
            price: "US$ 34",
            features: ["Automações", "E-mail sync"],
          },
          {
            name: "Professional",
            price: "US$ 49",
            features: ["AI Sales Assistant", "Reports avançados"],
            highlight: true,
            badge: "IA",
          },
          {
            name: "Enterprise",
            price: "US$ 99",
            features: ["SSO", "API ilimitada"],
          },
        ];

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${plans.length}, 1fr)`,
          gap: 14,
          marginBottom: 24,
        }}
      >
        {plans.map((p) => (
          <div
            key={p.name}
            style={{
              border: p.highlight
                ? `2px solid ${comp.color}`
                : "1px solid var(--via-navy-15)",
              borderRadius: 10,
              padding: 18,
              position: "relative",
              background: p.highlight
                ? "rgba(10,79,149,0.03)"
                : "var(--via-color-bg-surface)",
            }}
          >
            {p.badge && (
              <div
                style={{
                  position: "absolute",
                  top: -10,
                  right: 14,
                  background: comp.color,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  padding: "3px 8px",
                  borderRadius: 3,
                }}
              >
                {p.badge}
              </div>
            )}
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "var(--via-navy)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {p.name}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: "var(--via-navy)",
                marginTop: 4,
                letterSpacing: "-0.01em",
              }}
            >
              {p.price}
              <span
                style={{
                  fontSize: 12,
                  color: "var(--via-color-text-muted)",
                  fontWeight: 300,
                }}
              >
                /mês
              </span>
            </div>
            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {p.features.map((f) => (
                <div
                  key={f}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--via-color-text-body)",
                    fontWeight: 300,
                  }}
                >
                  <Check
                    size={12}
                    style={{ color: "var(--via-success)", marginTop: 2 }}
                  />
                  {f}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="ic-insight">
        <div className="ic-insight-mark">
          <Sparkles size={14} strokeWidth={2.2} />
        </div>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <div className="ic-insight-title">Análise de pricing</div>
            <AIBadge>IA</AIBadge>
          </div>
          <div className="ic-insight-body">
            O novo plano{" "}
            <strong style={{ color: "var(--via-navy)" }}>
              Pro a R$ 199
            </strong>{" "}
            entra <strong>40% abaixo</strong> do antigo plano Marketing (R$ 329)
            e cobre 80% das funcionalidades.{" "}
            <strong>Estratégia clara:</strong> capturar PMEs que estavam pulando
            direto para o concorrente Ploomes (R$ 229) ou ficando no plano Light
            por sensibilidade a preço. O bundle de IA + WhatsApp Business no
            mesmo preço sinaliza intenção de virar a oferta padrão do
            mid-market.
          </div>
        </div>
      </div>
    </div>
  );
}

function severityColor(s: Severity) {
  if (s === "high") return "var(--via-danger)";
  if (s === "medium") return "var(--via-warning)";
  return "var(--via-color-text-muted)";
}
