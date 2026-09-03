import { useEffect, useRef, useState } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { FlaskConical, Menu } from "lucide-react";

import { getSession, onAuthChange, type ApiSession } from "@/lib/api-client";
import { AppSidebar, type NavItemId } from "@/components/ic/app-sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDemoMode } from "@/lib/data/use-demo-mode";
import { useAlerts, useUnreadAlertsCount } from "@/lib/data/hooks/use-alerts";
import { useCompetitors } from "@/lib/data/hooks/use-competitors";
import { useMyProfile, rotuloDoPlano } from "@/lib/use-my-profile";

export const Route = createFileRoute("/_authed")({
  // IMPORTANTE: NAO usar `beforeLoad` para checar sessao aqui.
  // `beforeLoad` e isomorfico (roda no SSR tambem), mas a sessao vive em
  // `localStorage` (client-only) -- no servidor sempre retornaria `null` e
  // expulsaria o usuario a cada HMR/reload. O guard e feito no cliente,
  // dentro do componente.
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ApiSession | null | "loading">("loading");
  const location = useRouterState({ select: (s) => s.location });
  const redirectedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      getSession().then((s) => {
        if (!mounted) return;
        setSession(s);
        if (s) redirectedRef.current = false;
      });
    };
    load();
    const unsub = onAuthChange(load);
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    // Redireciona apenas UMA vez por "perda de sessao" -- evita loop.
    if (session === null && !redirectedRef.current) {
      redirectedRef.current = true;
      const current =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/dashboard";
      navigate({
        to: "/login",
        replace: true,
        search: { redirect: current },
      });
    }
  }, [session, navigate]);

  if (session === "loading") {
    return <FullScreenLoader />;
  }

  if (session === null) {
    return <FullScreenLoader />;
  }

  const currentNavId = pathToNavId(location.pathname);

  return <AuthedShell session={session} currentNavId={currentNavId} />;
}

function AuthedShell({
  session,
  currentNavId,
}: {
  session: ApiSession;
  currentNavId: NavItemId;
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const competitorsQ = useCompetitors();
  const alertsQ = useAlerts();
  const profileQ = useMyProfile();

  const onNavigate = (id: NavItemId) => {
    setDrawerOpen(false);
    if (id === "dashboard") return navigate({ to: "/dashboard" });
    if (id === "competitors") return navigate({ to: "/competitors" });
    if (id === "compare") return navigate({ to: "/compare" });
    if (id === "alerts") return navigate({ to: "/alerts" });
    if (id === "swot") return navigate({ to: "/swot" });
    if (id === "onboard") return navigate({ to: "/onboard" });
    if (id === "settings") return navigate({ to: "/settings" });
    if (id === "help") return navigate({ to: "/help" });
  };

  const userEmail = session.user.email ?? "Sua conta";
  const userInitials = (userEmail[0] ?? "A").toUpperCase();
  const userMetaName = session.user.nome ?? userEmail;

  // O contador conta NAO LIDOS. Contando o total, o numero da barra lateral
  // so crescia: nada no produto o fazia baixar, porque nem existia como
  // marcar um alerta como lido ate 03/09.
  const naoLidos = useUnreadAlertsCount();
  const counts: Partial<Record<NavItemId, number>> = {
    competitors: competitorsQ.data?.length,
    alerts: naoLidos,
  };

  const sidebar = (
    <AppSidebar
      current={currentNavId}
      onNavigate={onNavigate}
      counts={counts}
      userInitials={userInitials}
      userName={userMetaName}
      userPlan={rotuloDoPlano(profileQ.data?.plan) ?? undefined}
    />
  );

  return (
    <div className="ic-shell">
      {!isMobile && sidebar}
      {isMobile && (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            side="left"
            className="ic-drawer w-[260px] border-0 p-0"
            aria-describedby={undefined}
          >
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}
      <div
        className="ic-main"
        style={{ display: "flex", flexDirection: "column" }}
      >
        {isMobile && (
          <div className="ic-mobile-topbar">
            <button
              type="button"
              aria-label="Abrir menu de navegação"
              className="ic-mobile-menu-btn"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={20} strokeWidth={2} />
            </button>
            <span className="ic-mobile-topbar-title">
              Análise de Concorrentes
            </span>
          </div>
        )}
        <DemoBanner />
        <Outlet />
      </div>
    </div>
  );
}

function DemoBanner() {
  const { enabled, setEnabled } = useDemoMode();
  if (!enabled) return null;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "8px 16px",
        background: "var(--via-warning-bg)",
        color: "var(--via-warning)",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        borderBottom: "1px solid rgba(184,116,13,0.3)",
      }}
    >
      <FlaskConical size={14} strokeWidth={2} />
      <span>
        Modo demonstração ativo — dados simulados localmente, não persistem no
        banco.
      </span>
      <button
        type="button"
        onClick={() => setEnabled(false)}
        style={{
          background: "transparent",
          border: "1px solid var(--via-warning)",
          color: "var(--via-warning)",
          fontFamily: "var(--via-font)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "3px 10px",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        Sair do modo demo
      </button>
    </div>
  );
}

function pathToNavId(pathname: string): NavItemId {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/competitors")) return "competitors";
  if (pathname.startsWith("/compare")) return "compare";
  if (pathname.startsWith("/alerts")) return "alerts";
  if (pathname.startsWith("/swot")) return "swot";
  if (pathname.startsWith("/onboard")) return "onboard";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/help")) return "help";
  return "dashboard";
}

function FullScreenLoader() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--via-color-bg-page)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: "3px solid var(--via-navy-15)",
          borderTopColor: "var(--via-blue)",
          borderRadius: "50%",
          animation: "auth-spin 0.7s linear infinite",
        }}
      />
    </div>
  );
}
