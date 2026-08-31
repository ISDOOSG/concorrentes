import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { fmtTraffic, fmtDelta } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { AppTopbar } from "@/components/ic/app-topbar";
import { CompetitorFavicon } from "@/components/ic/competitor-favicon";
import { Sparkline } from "@/components/ic/sparkline";
import { UserMenu } from "@/components/ic/user-menu";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useCompetitors } from "@/lib/data/hooks/use-competitors";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import type { Competitor } from "@/lib/ic-mock";

export const Route = createFileRoute("/_authed/compare")({
  component: ComparePage,
});

const ROWS: Array<{
  label: string;
  render: (c: Competitor) => React.ReactNode;
}> = [
  {
    label: "Tráfego mensal",
    render: (c) => (
      <span style={{ fontWeight: 900, color: "var(--via-navy)" }}>
        {fmtTraffic(c.traffic)}
      </span>
    ),
  },
  {
    label: "Tendência (90 dias)",
    render: (c) => (
      <Sparkline values={c.trafficSeries} color={c.color} width={120} height={32} />
    ),
  },
  {
    label: "Δ MoM",
    render: (c) => (
      <span
        className={cn(
          "ic-kpi-delta",
          c.trafficDelta > 0 ? "up" : "down",
        )}
      >
        {fmtDelta(c.trafficDelta)}
      </span>
    ),
  },
  {
    label: "Keywords ranqueadas",
    render: (c) => (
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {c.seoKeywords.toLocaleString("pt-BR")}
      </span>
    ),
  },
  {
    label: "Faixa de preços",
    render: (c) => <span>{c.pricingTier}</span>,
  },
  {
    label: "Última mudança",
    render: (c) => (
      <span style={{ fontSize: 12 }}>
        <span className={cn("ic-pill", c.changeSeverity)}>
          {c.changeType}
        </span>
        <div style={{ marginTop: 4, color: "var(--via-color-text-muted)" }}>
          {c.changeSummary}
        </div>
      </span>
    ),
  },
  {
    label: "Health score",
    render: (c) => (
      <div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: "var(--via-navy)",
          }}
        >
          {c.health}
        </div>
        <div className="ic-health-bar" style={{ marginTop: 4 }}>
          <div
            className="ic-health-fill"
            style={{
              width: `${c.health}%`,
              background:
                c.health > 85
                  ? "var(--via-success)"
                  : c.health > 70
                    ? "var(--via-warning)"
                    : "var(--via-danger)",
            }}
          />
        </div>
      </div>
    ),
  },
  {
    label: "Top keywords",
    render: (c) => (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {c.keywordsTop.slice(0, 3).map((k) => (
          <span key={k} className="ic-tag">
            {k}
          </span>
        ))}
      </div>
    ),
  },
];

function ComparePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const competitorsQ = useCompetitors();
  const alertsQ = useAlerts();
  const [selected, setSelected] = useState<string[]>([]);

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const competitors = competitorsQ.data ?? [];
  const compareList = competitors.filter((c) => selected.includes(c.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 3
          ? prev
          : [...prev, id],
    );
  };

  return (
    <>
      <AppTopbar
        title="Comparar concorrentes"
        subtitle="Lado a lado · até 3"
        alertsCount={alertsQ.data?.length ?? 0}
        trailing={
          authed ? (
            <UserMenu
              email={authed.email}
              fullName={authed.fullName}
              onLogout={handleLogout}
            />
          ) : null
        }
      />
      <div className="ic-content">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {competitors.map((c) => {
            const checked = selected.includes(c.id);
            const disabled = !checked && selected.length >= 3;
            return (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                className={cn(
                  "ic-btn",
                  checked ? "ic-btn-primary" : "ic-btn-secondary",
                )}
                onClick={() => toggleSelect(c.id)}
                style={{
                  opacity: disabled ? 0.5 : 1,
                  display: "inline-flex",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: c.color,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 900,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {c.favicon}
                </span>
                {c.name}
              </button>
            );
          })}
        </div>

        {compareList.length === 0 ? (
          <div className="ic-empty">
            <div style={{ fontWeight: 700, color: "var(--via-navy)" }}>
              Selecione 2 ou 3 concorrentes acima
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              A comparação aparece aqui assim que você selecionar.
            </div>
          </div>
        ) : (
          <div
            className="ic-compare-grid"
            style={{
              gridTemplateColumns: `200px repeat(${compareList.length}, 1fr)`,
              display: "grid",
            }}
          >
            <div
              className="ic-compare-row head"
              style={{
                gridColumn: `span ${compareList.length + 1}`,
                gridTemplateColumns: `200px repeat(${compareList.length}, 1fr)`,
              }}
            >
              <div className="ic-compare-cell">Métrica</div>
              {compareList.map((c) => (
                <div
                  key={c.id}
                  className="ic-compare-cell"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <CompetitorFavicon comp={c} size={24} />
                  <span style={{ color: "var(--via-navy)" }}>{c.name}</span>
                </div>
              ))}
            </div>

            {ROWS.map((row) => (
              <div
                key={row.label}
                className="ic-compare-row"
                style={{
                  gridColumn: `span ${compareList.length + 1}`,
                  gridTemplateColumns: `200px repeat(${compareList.length}, 1fr)`,
                }}
              >
                <div
                  className="ic-compare-cell"
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                    color: "var(--via-color-text-muted)",
                    textTransform: "uppercase",
                    background: "var(--via-bg-2)",
                  }}
                >
                  {row.label}
                </div>
                {compareList.map((c) => (
                  <div key={c.id} className="ic-compare-cell">
                    {row.render(c)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
