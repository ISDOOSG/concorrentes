import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Sparkles } from "lucide-react";

import { AppTopbar } from "@/components/ic/app-topbar";
import { UserMenu } from "@/components/ic/user-menu";
import { IntegrationCard } from "@/components/ic/integration-card";
import { HowToObtainSheet } from "@/components/ic/how-to-obtain-sheet";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import { useScraperKeys } from "@/lib/data/hooks/use-scraper-keys";
import { INTEGRATIONS, INTEGRATION_LIST } from "@/content/integrations";
import type { ScraperProviderId, ScraperKeyInfo } from "@/lib/data/types";
import { SettingsSubnav } from "@/components/ic/settings-subnav";

export const Route = createFileRoute("/_authed/settings/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const keysQ = useScraperKeys();
  const [openId, setOpenId] = useState<ScraperProviderId | null>(null);

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const statusFor = (id: ScraperProviderId): ScraperKeyInfo =>
    keysQ.data?.find((k) => k.provider === id) ?? {
      provider: id,
      configured: false,
      keyHint: null,
      source: null,
      updatedAt: null,
    };

  return (
    <>
      <AppTopbar
        title="Configurações"
        subtitle="Sua conta · LLM · Monitoramento"
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
        <SettingsSubnav active="integrations" />

        <div className="ic-section-head" style={{ marginTop: 8 }}>
          <div className="ic-section-title">Integrações de Scraping</div>
        </div>

        <div className="ic-insight">
          <div className="ic-insight-mark">
            <Sparkles size={14} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="ic-insight-title" style={{ marginBottom: 4 }}>
              BYOK — Bring Your Own Key
            </div>
            <div className="ic-insight-body">
              Cada usuário cadastra suas próprias chaves dos provedores de
              scraping. Sua chave é{" "}
              <strong>criptografada antes de ser salva</strong> e nunca volta ao
              browser. O custo das chamadas é cobrado direto pelo provedor — você
              tem controle total da quota e dos limites.
            </div>
          </div>
        </div>

        {keysQ.isLoading ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--via-color-text-muted)",
              fontSize: 13,
            }}
          >
            Carregando integrações…
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {INTEGRATION_LIST.map((integ) => (
              <IntegrationCard
                key={integ.id}
                integration={integ}
                status={statusFor(integ.id)}
                onOpenHowTo={(id) => setOpenId(id)}
              />
            ))}
          </div>
        )}
      </div>

      <HowToObtainSheet
        open={openId !== null}
        integration={openId ? INTEGRATIONS[openId] : null}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
