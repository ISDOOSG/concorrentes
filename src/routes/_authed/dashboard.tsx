import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppTopbar } from "@/components/ic/app-topbar";
import { Dashboard } from "@/components/ic/dashboard/dashboard";
import { UserMenu } from "@/components/ic/user-menu";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import type { NavItemId } from "@/components/ic/app-sidebar";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const alertsCount = alertsQ.data?.length ?? 0;

  const ROUTE_BY_NAV: Partial<Record<NavItemId, string>> = {
    dashboard: "/dashboard",
    competitors: "/competitors",
    compare: "/compare",
    alerts: "/alerts",
    swot: "/swot",
    onboard: "/onboard",
    settings: "/settings",
  };

  const onNavigate = (id: NavItemId) => {
    const to = ROUTE_BY_NAV[id];
    if (!to) {
      toast.info(`Tela "${id}" em construção`);
      return;
    }
    navigate({ to });
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
