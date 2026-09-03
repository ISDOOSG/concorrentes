import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppTopbar } from "@/components/ic/app-topbar";
import { CompetitorDetail } from "@/components/ic/competitor-detail";
import { UserMenu } from "@/components/ic/user-menu";
import { useAuthedUser } from "@/lib/use-authed-user";
import {
  useCompetitor,
  useTriggerCrawl,
} from "@/lib/data/hooks/use-competitors";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import { toastDataError } from "@/lib/data/error-toast";
import { useUnreadAlertsCount } from "@/lib/data/hooks/use-alerts";

export const Route = createFileRoute("/_authed/competitors/$id")({
  component: CompetitorDetailPage,
});

function CompetitorDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const compQ = useCompetitor(id);
  const alertsQ = useAlerts();
  const naoLidos = useUnreadAlertsCount();
  const crawlMut = useTriggerCrawl();
  const [errorOpen, setErrorOpen] = useState(false);

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const c = compQ.data;

  return (
    <>
      <AppTopbar
        title={c?.name ?? "Concorrente"}
        subtitle="Concorrente"
        alertsCount={naoLidos}
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
        {compQ.isLoading && (
          <div
            className="ic-card"
            style={{ minHeight: 320, opacity: 0.4 }}
          />
        )}
        {!compQ.isLoading && !c && (
          <div className="ic-empty">
            <div style={{ fontWeight: 700, color: "var(--via-navy)" }}>
              Concorrente não encontrado
            </div>
            <button
              type="button"
              className="ic-btn ic-btn-secondary"
              style={{ marginTop: 12 }}
              onClick={() => navigate({ to: "/competitors" })}
            >
              Ver lista
            </button>
          </div>
        )}
        {c && (
          <CompetitorDetail
            comp={c}
            onBack={() => navigate({ to: "/competitors" })}
            onShowCrawlError={
              c.crawlStatus === "failed" && c.crawlError
                ? () => setErrorOpen(true)
                : undefined
            }
          />
        )}
      </div>

      {c && errorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,22,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setErrorOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 500,
              maxWidth: "100%",
              background: "var(--via-color-bg-surface)",
              borderRadius: 14,
              padding: 28,
              boxShadow: "var(--via-shadow-raised)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span className="ic-pill high">Falha no crawl</span>
            </div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: "var(--via-navy)",
                marginBottom: 6,
              }}
            >
              {c.name}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--via-color-text-muted)",
                marginBottom: 16,
              }}
            >
              {c.domain}
            </p>
            <div
              style={{
                background: "var(--via-danger-bg)",
                border: "1px solid rgba(182,58,47,0.18)",
                borderRadius: 8,
                padding: 14,
                fontSize: 13,
                color: "var(--via-danger)",
                fontFamily: "var(--via-font-mono)",
                lineHeight: 1.5,
                marginBottom: 22,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {c.crawlError ?? "Erro desconhecido."}
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="ic-btn ic-btn-secondary"
                onClick={() => setErrorOpen(false)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="ic-btn ic-btn-blue"
                onClick={() => {
                  crawlMut.mutate(c.id, {
                    onSuccess: () =>
                      toast.success(`Crawl reiniciado: ${c.name}`),
                    onError: (err) => toastDataError(err),
                  });
                  setErrorOpen(false);
                }}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
