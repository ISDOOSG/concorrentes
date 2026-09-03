import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { AppTopbar } from "@/components/ic/app-topbar";
import { UserMenu } from "@/components/ic/user-menu";
import { SettingsSubnav } from "@/components/ic/settings-subnav";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import {
  useLlmSettings,
  useSetLlmProvider,
  useSetLlmModel,
  useSaveLlmKey,
  useDeleteLlmKey,
} from "@/lib/data/hooks/use-llm-settings";
import { toastDataError } from "@/lib/data/error-toast";
import type { LLMProviderId, LLMUseCase } from "@/lib/data/types";
import { LLM_MODELS, getDefaultModel } from "@/lib/data/llm-models";
import { useUnreadAlertsCount } from "@/lib/data/hooks/use-alerts";

export const Route = createFileRoute("/_authed/settings/")({
  component: SettingsPage,
});

// 🚨 SÓ O GEMINI ESTÁ IMPLEMENTADO no serviço (ver api/ia.py). Esta lista
// oferecia quatro provedores; escolher Anthropic ou OpenAI fazia SWOT, SEO e
// Social responderem 501, e `lovable` era o gateway que morreu com o
// laboratório. Oferecer opção que não funciona é pior que não oferecer.
//
// Quando outro provedor for portado, ele volta aqui E no `LLM_MODELS` —
// nunca só num dos dois.
const PROVIDERS: Array<{
  id: LLMProviderId;
  name: string;
  description: string;
  byok: boolean;
}> = [
  {
    id: "gemini",
    name: "Google Gemini",
    description:
      "Gemini 3.5 Flash para análise e Flash Lite para volume. Usa a chave do projeto; cadastre a sua para cobrar na sua conta Google AI.",
    byok: true,
  },
];

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const naoLidos = useUnreadAlertsCount();
  const settingsQ = useLlmSettings();
  const setProviderMut = useSetLlmProvider();
  const setModelMut = useSetLlmModel();
  const saveKeyMut = useSaveLlmKey();
  const deleteKeyMut = useDeleteLlmKey();

  const [keyInput, setKeyInput] = useState<Record<string, string>>({});

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const settings = settingsQ.data;

  return (
    <>
      <AppTopbar
        title="Configurações"
        subtitle="Sua conta · LLM · Monitoramento"
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
        <SettingsSubnav active="account" />
        <div className="ic-section-head" style={{ marginTop: 4 }}>
          <div className="ic-section-title">Conta</div>
        </div>
        <div className="ic-card">
          <div className="ic-card-body">
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, var(--via-blue) 0%, #6BA8E0 100%)",
                  color: "#fff",
                  fontSize: 22,
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {authed?.initials}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: "var(--via-navy)",
                  }}
                >
                  {authed?.fullName ?? authed?.email ?? "Sua conta"}
                </div>
                <div
                  style={{ fontSize: 12, color: "var(--via-color-text-muted)" }}
                >
                  {authed?.email}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ic-section-head" style={{ marginTop: 8 }}>
          <div className="ic-section-title">LLM Provider</div>
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
              Por padrão usamos <strong>Lovable AI</strong> (cobrado pelo seu
              plano). Se preferir controle direto sobre custo e modelo, conecte
              sua chave Anthropic, OpenAI ou Gemini abaixo. Sua chave é
              criptografada antes de ser salva e nunca volta ao browser.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {PROVIDERS.map((p) => {
            const isSelected = settings?.provider === p.id;
            const entrada = settings?.hasKeyByProvider?.[p.id];
            // Chave do projeto nao e "chave cadastrada": nao se apaga, nao
            // tem data, e o campo para colar a propria continua disponivel.
            const doProjeto = entrada?.source === "projeto" ? entrada : null;
            const keyHint = entrada && !doProjeto ? entrada : null;
            const inputValue = keyInput[p.id] ?? "";
            return (
              <div
                key={p.id}
                className="ic-card"
                style={{
                  border: isSelected
                    ? `2px solid var(--via-blue)`
                    : "1px solid var(--via-navy-15)",
                }}
              >
                <div
                  className="ic-card-head"
                  style={{ alignItems: "flex-start" }}
                >
                  <div>
                    <div
                      className="ic-card-title"
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      {p.name}
                      {isSelected && (
                        <span className="ic-pill blue">
                          <Check size={10} />
                          Ativo
                        </span>
                      )}
                      {!p.byok && (
                        <span className="ic-pill success">Default</span>
                      )}
                    </div>
                    <div className="ic-card-sub">{p.description}</div>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      "ic-btn",
                      isSelected ? "ic-btn-secondary" : "ic-btn-primary",
                    )}
                    disabled={isSelected || setProviderMut.isPending}
                    onClick={() =>
                      setProviderMut.mutate(p.id, {
                        onSuccess: () =>
                          toast.success(`Provider trocado para ${p.name}`),
                      })
                    }
                  >
                    {isSelected ? "Em uso" : "Usar"}
                  </button>
                </div>
                {p.byok && (
                  <div className="ic-card-body">
                    {keyHint ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "var(--via-bg-2)",
                          borderRadius: 8,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--via-navy)",
                              fontWeight: 700,
                              fontFamily: "var(--via-font-mono)",
                            }}
                          >
                            sk-…{keyHint.keyHint}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--via-color-text-muted)",
                            }}
                          >
                            {keyHint.createdAt ? (
                              <>
                                Cadastrada em{" "}
                                {new Date(keyHint.createdAt).toLocaleDateString(
                                  "pt-BR",
                                )}
                              </>
                            ) : (
                              <>Cadastrada</>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="ic-iconbtn"
                          onClick={() =>
                            deleteKeyMut.mutate(p.id, {
                              onSuccess: () => toast.success("Chave removida"),
                              onError: (err) => toastDataError(err),
                            })
                          }
                          title="Remover"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <div>
                        {doProjeto && (
                          <div
                            style={{
                              marginBottom: 8,
                              padding: "8px 12px",
                              background: "var(--via-bg-2)",
                              borderRadius: 8,
                              fontSize: 12,
                              color: "var(--via-color-text-muted)",
                            }}
                          >
                            <strong style={{ color: "var(--via-navy)" }}>
                              Ativa pela chave do projeto
                            </strong>{" "}
                            (…{doProjeto.keyHint}) — já funciona sem você fazer
                            nada. Cole a sua abaixo para cobrar na sua conta.
                          </div>
                        )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="password"
                          className="via-input"
                          placeholder={`Cole sua chave ${p.name}`}
                          value={inputValue}
                          onChange={(e) =>
                            setKeyInput((s) => ({
                              ...s,
                              [p.id]: e.target.value,
                            }))
                          }
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="ic-btn ic-btn-blue"
                          disabled={
                            !inputValue ||
                            inputValue.length < 8 ||
                            saveKeyMut.isPending
                          }
                          onClick={() =>
                            saveKeyMut.mutate(
                              { provider: p.id, key: inputValue },
                              {
                                onSuccess: () => {
                                  setKeyInput((s) => ({
                                    ...s,
                                    [p.id]: "",
                                  }));
                                  toast.success("Chave salva e criptografada");
                                },
                                onError: (err) => toastDataError(err),
                              },
                            )
                          }
                        >
                          Salvar
                        </button>
                      </div>
                      </div>
                    )}
                  </div>
                )}
                {isSelected && (
                  <ModelSelector
                    provider={p.id}
                    classification={settings?.modelClassification ?? null}
                    swot={settings?.modelSwot ?? null}
                    isPending={setModelMut.isPending}
                    onChange={(useCase, modelId) =>
                      setModelMut.mutate(
                        { useCase, modelId },
                        {
                          onSuccess: () => toast.success("Modelo atualizado"),
                          onError: (err) => toastDataError(err),
                        },
                      )
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ModelSelector({
  provider,
  classification,
  swot,
  isPending,
  onChange,
}: {
  provider: LLMProviderId;
  classification: string | null;
  swot: string | null;
  isPending: boolean;
  onChange: (useCase: LLMUseCase, modelId: string | null) => void;
}) {
  const models = LLM_MODELS[provider] ?? [];
  if (models.length === 0) return null;

  const rows: Array<{
    useCase: LLMUseCase;
    label: string;
    hint: string;
    value: string;
    isDefault: boolean;
  }> = [
    {
      useCase: "classification",
      label: "Classificação de mudanças",
      hint: "Detecta tipo (pricing, feature, copy…) e severidade",
      value: classification ?? "",
      isDefault: !classification,
    },
    {
      useCase: "swot",
      label: "Geração de SWOT",
      hint: "Analisa snapshots e produz Forças/Fraquezas/Oportunidades/Ameaças",
      value: swot ?? "",
      isDefault: !swot,
    },
  ];

  return (
    <div
      className="ic-card-body"
      style={{
        borderTop: "1px solid var(--via-navy-15)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "var(--via-color-text-muted)",
        }}
      >
        Modelos por uso
      </div>
      {rows.map((r) => {
        const defaultId = getDefaultModel(provider, r.useCase);
        return (
          <div key={r.useCase} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--via-navy)" }}>
                  {r.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--via-color-text-muted)" }}>
                  {r.hint}
                </div>
              </div>
              {r.isDefault && (
                <span className="ic-pill" style={{ fontSize: 10 }}>
                  Default
                </span>
              )}
            </div>
            <select
              className="via-input"
              disabled={isPending}
              value={r.value || defaultId}
              onChange={(e) => {
                const next = e.target.value;
                onChange(r.useCase, next === defaultId ? null : next);
              }}
              style={{ fontSize: 13 }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.id === defaultId ? " · recomendado" : ""}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
