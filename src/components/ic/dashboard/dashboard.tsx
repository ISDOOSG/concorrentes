import {
  Sparkles,
  ArrowRight,
  Building,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  Megaphone,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtTraffic, fmtDelta } from "@/lib/formatters";
import { useCompetitors } from "@/lib/data/hooks/use-competitors";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import { ADS } from "@/lib/ic-mock";
import { isDemoMode } from "@/lib/data";
import type { Alert, Competitor } from "@/lib/ic-mock";

import { Sparkline } from "../sparkline";
import { MicroBars } from "../micro-bars";
import { CompetitorFavicon } from "../competitor-favicon";
import { AIBadge } from "../ai-badge";
import { ChangeTypeIcon } from "../change-type-icon";
import type { NavItemId } from "../app-sidebar";

type Props = {
  onNavigate: (id: NavItemId) => void;
  onSelectCompetitor: (id: string) => void;
};

export function Dashboard({ onNavigate, onSelectCompetitor }: Props) {
  const competitorsQ = useCompetitors();
  const alertsQ = useAlerts();
  const competitors = competitorsQ.data ?? [];
  const alerts = alertsQ.data ?? [];

  if (competitorsQ.isLoading || alertsQ.isLoading) {
    return <DashboardSkeleton />;
  }

  const totalAlerts = alerts.length;
  const highAlerts = alerts.filter((a) => a.severity === "high").length;

  // No Modo Demo, usa os ads mock dos seeds. No real, viria de listAds()
  // por competitor — pra agregar todos exigiria N+1 queries; deixamos
  // como TODO até criar uma view ou agregar via Edge Function.
  const demoMode = isDemoMode();
  const totalAdsMeta = demoMode
    ? ADS.filter((a) => a.source === "meta" && a.active).length
    : 0;
  const totalAdsGoogle = demoMode
    ? ADS.filter((a) => a.source === "google" && a.active).length
    : 0;
  const totalAdsActive = totalAdsMeta + totalAdsGoogle;

  return (
    <>
      <InsightStrip
        demoMode={demoMode}
        competitorsCount={competitors.length}
        totalAlerts={totalAlerts}
        highCount={highAlerts}
        onSeeSwot={() => onNavigate("swot")}
        onAddCompetitor={() => onNavigate("onboard")}
      />

      <div className="ic-kpi-strip">
        <div className="ic-kpi">
          <div className="ic-kpi-label">Concorrentes Monitorados</div>
          <div className="ic-kpi-value">{competitors.length}</div>
          <div className="ic-kpi-foot">
            {demoMode ? "de 50 disponíveis no plano Pro" : "ativos na sua conta"}
          </div>
          <div className="ic-kpi-spark">
            <Building
              size={20}
              strokeWidth={1.5}
              style={{ color: "var(--via-navy-40)" }}
            />
          </div>
        </div>
        <div className="ic-kpi">
          <div className="ic-kpi-label">Mudanças detectadas</div>
          <div className="ic-kpi-value">{totalAlerts}</div>
          {demoMode && (
            <div className="ic-kpi-delta up">
              <TrendingUp size={12} />
              +33% vs semana anterior
            </div>
          )}
          <div className="ic-kpi-spark">
            {demoMode ? (
              <MicroBars values={[3, 2, 4, 3, 5, 4, 6]} />
            ) : (
              <TrendingUp
                size={20}
                strokeWidth={1.5}
                style={{ color: "var(--via-navy-40)" }}
              />
            )}
          </div>
        </div>
        <div className="ic-kpi">
          <div className="ic-kpi-label">Alertas Críticos</div>
          <div className="ic-kpi-value" style={{ color: "var(--via-danger)" }}>
            {highAlerts}
          </div>
          <div className="ic-kpi-foot">{criticalFoot(alerts)}</div>
          <div className="ic-kpi-spark">
            <AlertTriangle
              size={20}
              strokeWidth={1.5}
              style={{ color: "var(--via-danger)", opacity: 0.5 }}
            />
          </div>
        </div>
        <div className="ic-kpi">
          <div className="ic-kpi-label">Ads Ativos (Meta + Google)</div>
          <div className="ic-kpi-value">{totalAdsActive}</div>
          <div className="ic-kpi-foot">
            {totalAdsMeta} no Meta · {totalAdsGoogle} no Google
          </div>
          <div className="ic-kpi-spark">
            <Megaphone
              size={20}
              strokeWidth={1.5}
              style={{ color: "var(--via-blue)", opacity: 0.5 }}
            />
          </div>
        </div>
      </div>

      <div className="ic-grid-main" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        <CompetitorsCard
          demoMode={demoMode}
          competitors={competitors}
          onSeeAll={() => onNavigate("competitors")}
          onSelectCompetitor={onSelectCompetitor}
        />
        <RecentAlertsCard
          alerts={alerts}
          competitors={competitors}
          onSeeAll={() => onNavigate("alerts")}
          onSelectCompetitor={onSelectCompetitor}
        />
      </div>

      <div className="ic-grid-half" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div className="ic-card">
          <div className="ic-card-head">
            <div>
              <div className="ic-card-title">
                {demoMode ? "Share de tráfego (categoria CRM)" : "Share de tráfego"}
              </div>
              <div className="ic-card-sub">
                {demoMode
                  ? "Estimativa Similarweb · últimos 30 dias"
                  : "Estimativa de tráfego dos concorrentes monitorados"}
              </div>
            </div>
          </div>
          <div className="ic-card-body">
            <ShareOfVoice competitors={competitors} />
          </div>
        </div>

        <div className="ic-card">
          <div className="ic-card-head">
            <div>
              <div className="ic-card-title">Movimentos por tipo</div>
              <div className="ic-card-sub">
                distribuição dos alertas registrados
              </div>
            </div>
          </div>
          <div className="ic-card-body">
            <ChangeTypeBreakdown alerts={alerts} />
          </div>
        </div>
      </div>
    </>
  );
}

const CRITICAL_TYPE_LABELS: Record<string, string> = {
  feature: "funcionalidade",
  pricing: "preço",
  copy: "copy",
  design: "design",
  content: "conteúdo",
};

function criticalFoot(alerts: Alert[]): string {
  const high = alerts.filter((a) => a.severity === "high");
  if (high.length === 0) return "nenhum alerta crítico no momento";
  const byType = new Map<string, number>();
  for (const a of high) {
    byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
  }
  return [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, n]) => `${n} ${CRITICAL_TYPE_LABELS[t] ?? t}`)
    .join(" · ");
}

function DashboardSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          height: 96,
          background: "var(--via-bg-2)",
          borderRadius: 10,
          opacity: 0.5,
        }}
      />
      <div className="ic-kpi-strip">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="ic-kpi"
            style={{ minHeight: 110, opacity: 0.4 }}
          />
        ))}
      </div>
      <div className="ic-grid-main" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        <div className="ic-card" style={{ minHeight: 280, opacity: 0.4 }} />
        <div className="ic-card" style={{ minHeight: 280, opacity: 0.4 }} />
      </div>
    </div>
  );
}

function InsightStrip({
  demoMode,
  competitorsCount,
  totalAlerts,
  highCount,
  onSeeSwot,
  onAddCompetitor,
}: {
  demoMode: boolean;
  competitorsCount: number;
  totalAlerts: number;
  highCount: number;
  onSeeSwot: () => void;
  onAddCompetitor: () => void;
}) {
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  const emptyAccount = !demoMode && competitorsCount === 0;
  return (
    <div className="ic-insight">
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
          <div className="ic-insight-title">Briefing executivo · {today}</div>
          {demoMode && <AIBadge>IA</AIBadge>}
        </div>
        <div className="ic-insight-body">
          {demoMode ? (
            <>
              Os últimos 7 dias mostram{" "}
              <strong style={{ color: "var(--via-navy)", fontWeight: 900 }}>
                movimento agressivo em IA
              </strong>
              : RD Station e Pipedrive lançaram assistentes generativos com ~48h
              de diferença, enquanto HubSpot reposicionou a home como
              "AI-Powered Customer Platform".{" "}
              <strong style={{ color: "var(--via-navy)", fontWeight: 900 }}>
                Recomendação:
              </strong>{" "}
              revisar o roadmap de IA do trimestre e considerar resposta de
              comunicação na próxima semana.{" "}
              <strong style={{ color: "var(--via-danger)", fontWeight: 900 }}>
                {highCount} ameaças
              </strong>{" "}
              e{" "}
              <strong style={{ color: "var(--via-success)", fontWeight: 900 }}>
                1 oportunidade
              </strong>{" "}
              de alta confiança identificadas.
            </>
          ) : emptyAccount ? (
            <>
              Adicione seus concorrentes para começar o monitoramento — o
              briefing, os alertas e a análise SWOT por IA passam a rodar a
              partir do primeiro crawl.
            </>
          ) : (
            <>
              Seu radar acompanha{" "}
              <strong style={{ color: "var(--via-navy)", fontWeight: 900 }}>
                {competitorsCount}{" "}
                {competitorsCount === 1 ? "concorrente" : "concorrentes"}
              </strong>
              , com{" "}
              <strong style={{ color: "var(--via-navy)", fontWeight: 900 }}>
                {totalAlerts} {totalAlerts === 1 ? "alerta" : "alertas"}
              </strong>{" "}
              {highCount > 0 ? (
                <>
                  registrados —{" "}
                  <strong
                    style={{ color: "var(--via-danger)", fontWeight: 900 }}
                  >
                    {highCount} de severidade alta
                  </strong>
                  .
                </>
              ) : (
                <>registrados, nenhum crítico no momento.</>
              )}{" "}
              A análise SWOT consolida o panorama por concorrente.
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        className="ic-btn ic-btn-secondary"
        onClick={emptyAccount ? onAddCompetitor : onSeeSwot}
      >
        {emptyAccount ? "Adicionar concorrente" : "Ver SWOT completo"}
        <ArrowRight size={12} />
      </button>
    </div>
  );
}

function CompetitorsCard({
  demoMode,
  competitors,
  onSeeAll,
  onSelectCompetitor,
}: {
  demoMode: boolean;
  competitors: Competitor[];
  onSeeAll: () => void;
  onSelectCompetitor: (id: string) => void;
}) {
  return (
    <div className="ic-card">
      <div className="ic-card-head">
        <div>
          <div className="ic-card-title">Concorrentes em monitoramento</div>
          <div className="ic-card-sub">
            {competitors.length} ativos
            {demoMode && " · Última varredura há 14 minutos"}
          </div>
        </div>
        <button
          type="button"
          className="ic-btn ic-btn-ghost"
          onClick={onSeeAll}
        >
          Ver todos
          <ArrowRight size={12} />
        </button>
      </div>
      <div>
        {competitors.length === 0 && (
          <div className="ic-empty">
            <div className="ic-empty-icon">
              <Building size={24} />
            </div>
            <div style={{ fontWeight: 700, color: "var(--via-navy)" }}>
              Nenhum concorrente cadastrado
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Adicione um pra começar
            </div>
          </div>
        )}
        {competitors.map((c) => (
          <div
            key={c.id}
            className="ic-comp-row"
            onClick={() => onSelectCompetitor(c.id)}
          >
            <CompetitorFavicon comp={c} />
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <div className="ic-comp-name">{c.name}</div>
              <div className="ic-comp-domain">
                {c.domain} · {c.category}
              </div>
            </div>
            <div style={{ textAlign: "right", minWidth: 96 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: "var(--via-navy)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtTraffic(c.traffic)}
              </div>
              <div
                className={cn(
                  "ic-kpi-delta",
                  c.trafficDelta > 0 ? "up" : "down",
                )}
                style={{ fontSize: 11 }}
              >
                {fmtDelta(c.trafficDelta)}
              </div>
            </div>
            <Sparkline
              values={c.trafficSeries}
              color={c.color}
              width={70}
              height={26}
            />
            <div style={{ minWidth: 80 }}>
              <span className={cn("ic-pill", c.changeSeverity)}>
                <span className={cn("ic-sev-dot", c.changeSeverity)} />
                {c.changeType}
              </span>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--via-color-text-muted)",
                  marginTop: 4,
                  letterSpacing: "0.04em",
                }}
              >
                {c.lastChange}
              </div>
            </div>
            <ChevronRight
              size={14}
              style={{ color: "var(--via-color-text-muted)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentAlertsCard({
  alerts,
  competitors,
  onSeeAll,
  onSelectCompetitor,
}: {
  alerts: Alert[];
  competitors: Competitor[];
  onSeeAll: () => void;
  onSelectCompetitor: (id: string) => void;
}) {
  return (
    <div className="ic-card">
      <div className="ic-card-head">
        <div>
          <div className="ic-card-title">Alertas recentes</div>
          <div className="ic-card-sub">Mudanças significativas detectadas</div>
        </div>
        <button
          type="button"
          className="ic-btn ic-btn-ghost"
          onClick={onSeeAll}
        >
          Ver todos
          <ArrowRight size={12} />
        </button>
      </div>
      <div style={{ padding: "8px 0" }}>
        {alerts.slice(0, 4).map((a) => {
          const c = competitors.find((x) => x.id === a.competitor);
          if (!c) return null;
          return (
            <div
              key={a.id}
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--via-navy-15)",
                cursor: "pointer",
              }}
              onClick={() => onSelectCompetitor(a.competitor)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span className={cn("ic-sev-dot", a.severity)} />
                <div
                  className="ic-alert-mini-fav"
                  style={{ background: c.color }}
                >
                  {c.favicon}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: "var(--via-navy)",
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--via-color-text-muted)",
                    marginLeft: "auto",
                  }}
                >
                  {a.time}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--via-color-text-body)",
                  fontWeight: 700,
                  lineHeight: 1.4,
                  marginBottom: 4,
                }}
              >
                {a.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--via-color-text-muted)",
                  lineHeight: 1.4,
                }}
              >
                {a.detail}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShareOfVoice({ competitors }: { competitors: Competitor[] }) {
  if (competitors.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--via-color-text-muted)" }}>
        Sem dados ainda — adicione concorrentes pra ver o share.
      </div>
    );
  }
  if (competitors.every((c) => c.traffic === 0)) {
    return (
      <div style={{ fontSize: 13, color: "var(--via-color-text-muted)" }}>
        Os dados de tráfego chegam com os primeiros crawls dos concorrentes.
      </div>
    );
  }
  const total = competitors.reduce((s, c) => s + c.traffic, 0) || 1;
  const sorted = [...competitors].sort((a, b) => b.traffic - a.traffic);
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 28,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 16,
          border: "1px solid var(--via-navy-15)",
        }}
      >
        {sorted.map((c) => (
          <div
            key={c.id}
            style={{
              flex: c.traffic / total,
              background: c.color,
              position: "relative",
            }}
            title={`${c.name} · ${fmtTraffic(c.traffic)}`}
          />
        ))}
      </div>
      {sorted.map((c) => (
        <div
          key={c.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 0",
            borderBottom: "1px dashed var(--via-navy-15)",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: c.color,
            }}
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--via-navy)",
              flex: 1,
            }}
          >
            {c.name}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--via-color-text-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtTraffic(c.traffic)}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 900,
              color: "var(--via-navy)",
              minWidth: 48,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {((c.traffic / total) * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

const CHANGE_TYPE_META = [
  { key: "feature", label: "Funcionalidades", color: "var(--via-blue)" },
  { key: "pricing", label: "Preços", color: "var(--via-warning)" },
  { key: "copy", label: "Copy & posicionamento", color: "var(--via-util-5)" },
  { key: "design", label: "Design / UX", color: "var(--via-util-6)" },
  { key: "content", label: "Conteúdo / blog", color: "var(--via-success)" },
] as const;

function ChangeTypeBreakdown({ alerts }: { alerts: Alert[] }) {
  const counts = new Map<string, number>();
  for (const a of alerts) {
    counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
  }
  const types = CHANGE_TYPE_META.map((t) => ({
    ...t,
    count: counts.get(t.key) ?? 0,
  })).filter((t) => t.count > 0);
  const total = types.reduce((s, t) => s + t.count, 0);
  if (total === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--via-color-text-muted)" }}>
        Sem movimentos registrados ainda — eles aparecem aqui conforme os
        crawls detectam mudanças.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {types.map((t) => (
        <div key={t.key}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 5,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--via-navy)",
                fontWeight: 700,
              }}
            >
              <ChangeTypeIcon type={t.key} size={14} />
              {t.label}
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--via-color-text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <strong style={{ color: "var(--via-navy)", fontWeight: 900 }}>
                {t.count}
              </strong>{" "}
              · {((t.count / total) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="ic-health-bar">
            <div
              className="ic-health-fill"
              style={{ width: `${(t.count / total) * 100}%`, background: t.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
