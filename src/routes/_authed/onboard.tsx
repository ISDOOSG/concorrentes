import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { AppTopbar } from "@/components/ic/app-topbar";
import { UserMenu } from "@/components/ic/user-menu";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import { useCreateCompetitor } from "@/lib/data/hooks/use-competitors";
import { useUnreadAlertsCount } from "@/lib/data/hooks/use-alerts";

export const Route = createFileRoute("/_authed/onboard")({
  component: OnboardPage,
});

type Row = { id: number; url: string; name: string };

function OnboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const naoLidos = useUnreadAlertsCount();
  const createMut = useCreateCompetitor();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [rows, setRows] = useState<Row[]>([
    { id: 1, url: "", name: "" },
    { id: 2, url: "", name: "" },
  ]);

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const addRow = () =>
    setRows((r) => [...r, { id: Date.now(), url: "", name: "" }]);
  const removeRow = (id: number) =>
    setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const validRows = rows.filter((r) => r.url.trim().length > 3);

  const finish = async () => {
    setStep(2);
    for (const r of validRows) {
      try {
        await createMut.mutateAsync({ name: r.name, url: r.url });
      } catch {
        // ignora erros isolados; segue
      }
    }
    toast.success(`${validRows.length} concorrentes adicionados`);
    navigate({ to: "/competitors" });
  };

  return (
    <>
      <AppTopbar
        title="Adicionar concorrente"
        subtitle="Onboarding"
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
        <div className="ic-onboard">
          <div className="ic-step-bar">
            <div className={`ic-step-dot ${step >= 0 ? "active" : ""}`} />
            <div className={`ic-step-dot ${step >= 1 ? "active" : ""}`} />
            <div className={`ic-step-dot ${step >= 2 ? "done" : ""}`} />
          </div>

          {step === 0 && (
            <>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: "var(--via-navy)",
                  marginBottom: 6,
                }}
              >
                Quem você quer monitorar?
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--via-color-text-muted)",
                  marginBottom: 24,
                }}
              >
                Cole as URLs principais. Mínimo 1, recomendado 3-5. Você pode
                adicionar mais depois.
              </p>

              {rows.map((r, i) => (
                <div key={r.id} className="ic-url-row">
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      color: "var(--via-color-text-muted)",
                      minWidth: 18,
                    }}
                  >
                    {i + 1}.
                  </span>
                  <input
                    placeholder="rdstation.com"
                    value={r.url}
                    onChange={(e) => updateRow(r.id, { url: e.target.value })}
                    style={{ flex: 2 }}
                  />
                  <input
                    placeholder="Nome (opcional)"
                    value={r.name}
                    onChange={(e) => updateRow(r.id, { name: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="ic-iconbtn"
                      onClick={() => removeRow(r.id)}
                      title="Remover"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="ic-btn ic-btn-secondary"
                style={{ marginTop: 8 }}
                onClick={addRow}
              >
                <Plus size={12} />
                Adicionar mais um
              </button>

              <div
                style={{
                  marginTop: 28,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <button
                  type="button"
                  className="ic-btn ic-btn-ghost"
                  onClick={() => navigate({ to: "/dashboard" })}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="ic-btn ic-btn-blue"
                  disabled={validRows.length === 0}
                  onClick={() => setStep(1)}
                >
                  Continuar ({validRows.length})
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: "var(--via-navy)",
                  marginBottom: 6,
                }}
              >
                Confirmação
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--via-color-text-muted)",
                  marginBottom: 24,
                }}
              >
                Vamos crawlear estas URLs assim que você confirmar. Pode levar
                alguns minutos.
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 24,
                }}
              >
                {validRows.map((r) => (
                  <li
                    key={r.id}
                    style={{
                      padding: "10px 14px",
                      background: "var(--via-bg-2)",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "var(--via-navy)",
                    }}
                  >
                    <strong>{r.name || r.url.replace(/^https?:\/\//, "")}</strong>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--via-color-text-muted)",
                      }}
                    >
                      {r.url}
                    </div>
                  </li>
                ))}
              </ul>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <button
                  type="button"
                  className="ic-btn ic-btn-secondary"
                  onClick={() => setStep(0)}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className="ic-btn ic-btn-blue"
                  onClick={finish}
                  disabled={createMut.isPending}
                >
                  Confirmar e crawlear
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: "var(--via-navy)",
                  marginBottom: 8,
                }}
              >
                Crawleando…
              </div>
              <div style={{ fontSize: 13, color: "var(--via-color-text-muted)" }}>
                Você será redirecionado em instantes.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
