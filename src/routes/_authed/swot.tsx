import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/ic/app-topbar";
import { AIBadge } from "@/components/ic/ai-badge";
import { CompetitorFavicon } from "@/components/ic/competitor-favicon";
import { SkeletonSwot } from "@/components/ic/skeleton";
import { UserMenu } from "@/components/ic/user-menu";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useCompetitors } from "@/lib/data/hooks/use-competitors";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import { useSwot, useGenerateSwot } from "@/lib/data/hooks/use-swot";
import { toastDataError } from "@/lib/data/error-toast";
import type { SwotItem } from "@/lib/ic-mock";

export const Route = createFileRoute("/_authed/swot")({
  component: SwotPage,
});

function SwotPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const competitorsQ = useCompetitors();
  const alertsQ = useAlerts();
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const swotQ = useSwot(selected);
  const genMut = useGenerateSwot();

  useEffect(() => {
    if (!selected && (competitorsQ.data?.length ?? 0) > 0) {
      setSelected(competitorsQ.data![0].id);
    }
  }, [competitorsQ.data, selected]);

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const competitors = competitorsQ.data ?? [];
  const swot = swotQ.data;
  const isGenerating = genMut.isPending;

  return (
    <>
      <AppTopbar
        title="Análise SWOT"
        subtitle="Gerada por IA"
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
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <select
            className="via-select"
            style={{ width: 280 }}
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || undefined)}
          >
            <option value="">Selecione um concorrente</option>
            {competitors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {selected && (
            <button
              type="button"
              className="ic-btn ic-btn-blue"
              disabled={isGenerating}
              onClick={() =>
                genMut.mutate(selected, {
                  onSuccess: () => toast.success("SWOT atualizado"),
                  onError: (err) => toastDataError(err),
                })
              }
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={14} className="spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Gerar SWOT
                </>
              )}
            </button>
          )}
        </div>

        {!selected && (
          <div className="ic-empty">
            <div style={{ fontWeight: 700, color: "var(--via-navy)" }}>
              Selecione um concorrente acima
            </div>
          </div>
        )}

        {selected && swotQ.isLoading && <SkeletonSwot />}

        {selected && swot && !swotQ.isLoading && (
          <>
            {(() => {
              const c = competitors.find((x) => x.id === selected);
              if (!c) return null;
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
                      <CompetitorFavicon comp={c} size={20} />
                      <div className="ic-insight-title">
                        SWOT vs {c.name}
                      </div>
                      <AIBadge>IA · Lovable AI default</AIBadge>
                    </div>
                    <div className="ic-insight-body">
                      Gerado a partir dos últimos 30 dias de snapshots e
                      mudanças detectadas. {isGenerating && " Atualizando…"}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="ic-swot">
              <SwotCell
                kind="s"
                title="Forças"
                items={swot.strengths}
              />
              <SwotCell
                kind="w"
                title="Fraquezas"
                items={swot.weaknesses}
              />
              <SwotCell
                kind="o"
                title="Oportunidades"
                items={swot.opportunities}
              />
              <SwotCell
                kind="t"
                title="Ameaças"
                items={swot.threats}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SwotCell({
  kind,
  title,
  items,
}: {
  kind: "s" | "w" | "o" | "t";
  title: string;
  items: SwotItem[];
}) {
  return (
    <div className={`ic-swot-cell ${kind}`}>
      <div className="ic-swot-head">
        <div className="ic-swot-letter">{kind.toUpperCase()}</div>
        <div className="ic-swot-title">{title}</div>
      </div>
      {items.map((it) => (
        <div key={it.title} className="ic-swot-item">
          <div className="ic-swot-item-title">{it.title}</div>
          <div className="ic-swot-item-evidence">{it.evidence}</div>
        </div>
      ))}
    </div>
  );
}
