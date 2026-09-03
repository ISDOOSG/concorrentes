import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { AppTopbar } from "@/components/ic/app-topbar";
import { Dashboard } from "@/components/ic/dashboard/dashboard";
import { UserMenu } from "@/components/ic/user-menu";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useAlerts, useUnreadAlertsCount } from "@/lib/data/hooks/use-alerts";
import type { NavItemId } from "@/components/ic/app-sidebar";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const alertsCount = useUnreadAlertsCount();

  // Atalhos internos do dashboard (cartoes "ver todos", "gerar SWOT"...).
  // A navegacao da barra lateral NAO passa por aqui -- ela vive em
  // `routes/_authed.tsx` e cobre os 8 destinos. Este mapa cobre so os ids
  // que os cartoes do dashboard disparam, e o `NavItemId` garante em tempo
  // de compilacao que nenhum id invalido entre.
  const ROUTE_BY_NAV: Record<
    Extract<NavItemId, "dashboard" | "competitors" | "compare" | "alerts" | "swot" | "onboard" | "settings" | "help">,
    string
  > = {
    dashboard: "/dashboard",
    competitors: "/competitors",
    compare: "/compare",
    alerts: "/alerts",
    swot: "/swot",
    onboard: "/onboard",
    settings: "/settings",
    help: "/help",
  };

  const onNavigate = (id: NavItemId) => {
    navigate({ to: ROUTE_BY_NAV[id] });
  };

  const onSelectCompetitor = (id: string) => {
    navigate({ to: "/competitors/$id", params: { id } });
  };

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  return (
    <>
      <AppTopbar
        title="Dashboard"
        subtitle={`Visão geral · ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`}
        alertsCount={alertsCount}
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
        <Dashboard
          onNavigate={onNavigate}
          onSelectCompetitor={onSelectCompetitor}
        />
      </div>
    </>
  );
}
