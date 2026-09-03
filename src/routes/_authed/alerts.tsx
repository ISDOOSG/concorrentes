import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { AppTopbar } from "@/components/ic/app-topbar";
import { ChangeTypeIcon } from "@/components/ic/change-type-icon";
import { SkeletonAlertRow } from "@/components/ic/skeleton";
import { UserMenu } from "@/components/ic/user-menu";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useAlerts, useMarkAlertRead } from "@/lib/data/hooks/use-alerts";
import { toastDataError } from "@/lib/data/error-toast";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useCompetitors } from "@/lib/data/hooks/use-competitors";
import type { Severity } from "@/lib/ic-mock";

export const Route = createFileRoute("/_authed/alerts")({
  component: AlertsPage,
});

const SEVERITIES: Array<{ id: "all" | Severity; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "high", label: "Crítico" },
  { id: "medium", label: "Atenção" },
  { id: "low", label: "Info" },
];

function AlertsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const competitorsQ = useCompetitors();
  const marcarLido = useMarkAlertRead();
  const [severity, setSeverity] = useState<"all" | Severity>("all");
  const [competitorFilter, setCompetitorFilter] = useState<string | "all">(
    "all",
  );
  const [busca, setBusca] = useState("");

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const competitors = competitorsQ.data ?? [];
  const allAlerts = alertsQ.data ?? [];

  const naoLidos = allAlerts.filter((a) => !a.read).length;

  const filtered = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return allAlerts.filter(
      (a) =>
        (severity === "all" || a.severity === severity) &&
        (competitorFilter === "all" || a.competitor === competitorFilter) &&
        (termo === "" || a.title.toLowerCase().includes(termo)),
    );
  }, [allAlerts, severity, competitorFilter, busca]);

  return (
    <>
      <AppTopbar
        title="Alertas"
        subtitle={`${allAlerts.length} mudanças detectadas · ${naoLidos} não lidas`}
        alertsCount={naoLidos}
        onSearchChange={setBusca}
        searchPlaceholder="Buscar no texto do alerta…"
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
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {SEVERITIES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn(
                  "ic-btn",
                  severity === s.id ? "ic-btn-primary" : "ic-btn-secondary",
                )}
                onClick={() => setSeverity(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select
            className="via-select"
            style={{ width: 240 }}
            value={competitorFilter}
            onChange={(e) => setCompetitorFilter(e.target.value)}
          >
            <option value="all">Todos os concorrentes</option>
            {competitors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ic-card" style={{ padding: 0 }}>
          {alertsQ.isLoading ? (
            <>
              {[0, 1, 2, 3, 4].map((i) => (
                <SkeletonAlertRow key={i} />
              ))}
            </>
          ) : filtered.length === 0 ? (
            <div className="ic-empty">
              <div style={{ fontWeight: 700, color: "var(--via-navy)" }}>
                Nenhum alerta com esses filtros
              </div>
            </div>
          ) : (
            filtered.map((a) => {
              const c = competitors.find((x) => x.id === a.competitor);
              return (
                <div
                  key={a.id}
                  className="ic-alert"
                  onClick={() =>
                    a.competitor &&
                    navigate({
                      to: "/competitors/$id",
                      params: { id: a.competitor },
                    })
                  }
                >
                  <span className={cn("ic-sev-dot", a.severity)} />
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {c && (
                      <div
                        className="ic-alert-mini-fav"
                        style={{ background: c.color }}
                      >
                        {c.favicon}
                      </div>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 900, color: "var(--via-navy)" }}>
                      {c?.name ?? a.competitor}
                    </span>
                  </div>
                  <div>
                    <div className="ic-alert-title">
                      <span
                        className={cn("ic-pill", a.severity)}
                        style={{ marginRight: 6 }}
                      >
                        <ChangeTypeIcon type={a.type} size={10} />
                        {a.type}
                      </span>
                      {a.title}
                    </div>
                    <div className="ic-alert-detail">{a.detail}</div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--via-color-text-muted)",
                      textAlign: "right",
                    }}
                  >
                    {a.confidence}% conf.
                  </div>
                  <div className="ic-alert-time">{a.time}</div>
                  {a.read ? (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--via-color-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Lida
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ic-btn ic-btn-secondary"
                      style={{ whiteSpace: "nowrap" }}
                      disabled={marcarLido.isPending}
                      onClick={(e) => {
                        // A linha inteira navega para o concorrente; sem isto
                        // marcar como lida levaria o usuario para outra tela.
                        e.stopPropagation();
                        marcarLido.mutate(a.id, {
                          onSuccess: () => toast.success("Alerta marcado como lido"),
                          onError: (err) => toastDataError(err),
                        });
                      }}
                    >
                      <Check size={12} />
                      Marcar como lida
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
