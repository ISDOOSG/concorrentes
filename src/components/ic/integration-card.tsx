import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Check,
  HelpCircle,
  Trash2,
  Zap,
} from "lucide-react";

import { ApiKeyInput } from "./api-key-input";
import {
  useDeleteScraperKey,
  useSaveScraperKey,
  useTestScraperKey,
  useTestStoredKey,
} from "@/lib/data/hooks/use-scraper-keys";
import type { IntegrationContent } from "@/content/integrations/types";
import type {
  ScraperKeyInfo,
  ScraperProviderId,
} from "@/lib/data/types";

type Props = {
  integration: IntegrationContent;
  status: ScraperKeyInfo;
  onOpenHowTo: (id: ScraperProviderId) => void;
};

export function IntegrationCard({ integration, status, onOpenHowTo }: Props) {
  const [editing, setEditing] = useState(false);
  const [keyValue, setKeyValue] = useState("");

  const saveMut = useSaveScraperKey();
  const deleteMut = useDeleteScraperKey();
  const testMut = useTestScraperKey();
  const testStoredMut = useTestStoredKey();

  const handleTestStored = async () => {
    const res = await testStoredMut.mutateAsync(integration.id);
    if (res.ok) {
      toast.success(
        `${integration.name} conectado${
          res.latencyMs ? ` (${res.latencyMs}ms)` : ""
        }`,
      );
    } else {
      toast.error(`${integration.name}: ${res.error}`);
    }
  };

  const isConfigured = status.configured;

  const handleTestAndSave = async () => {
    const trimmed = keyValue.trim();
    if (trimmed.length < 8) {
      toast.error("Cole uma chave válida");
      return;
    }
    const res = await testMut.mutateAsync({
      provider: integration.id,
      keyOverride: trimmed,
    });
    if (!res.ok) {
      toast.error(`Chave inválida: ${res.error}`);
      return;
    }
    await saveMut.mutateAsync({
      provider: integration.id,
      key: trimmed,
      source: "manual",
    });
    toast.success(
      `Chave ${integration.name} validada e salva${
        res.latencyMs ? ` (${res.latencyMs}ms)` : ""
      }`,
    );
    setKeyValue("");
    setEditing(false);
  };

  const handleRemove = async () => {
    if (!confirm(`Remover a chave ${integration.name}?`)) return;
    await deleteMut.mutateAsync(integration.id);
    toast.success(`Chave ${integration.name} removida`);
  };

  return (
    <div
      className="ic-card"
      style={{
        border: isConfigured
          ? "1px solid var(--via-success, #2ea36a)"
          : "1px solid var(--via-navy-15)",
      }}
    >
      <div
        className="ic-card-head"
        style={{ alignItems: "flex-start", gap: 10 }}
      >
        <div style={{ display: "flex", gap: 12, flex: 1 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--via-bg-2, #f5f7fb)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {integration.emoji}
          </div>
          <div style={{ flex: 1 }}>
            <div
              className="ic-card-title"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {integration.name}
              {integration.optional && (
                <span className="ic-pill" style={{ fontSize: 10 }}>
                  Opcional
                </span>
              )}
              {isConfigured ? (
                <span
                  className="ic-pill success"
                  style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
                >
                  <Check size={10} />
                  Conectado
                  {status.keyHint && (
                    <code
                      style={{
                        fontFamily: "var(--via-font-mono)",
                        fontSize: 11,
                        marginLeft: 4,
                      }}
                    >
                      ••••{status.keyHint}
                    </code>
                  )}
                  {status.source === "lovable_connector" && (
                    <span style={{ marginLeft: 4 }}>via Lovable</span>
                  )}
                </span>
              ) : (
                <span
                  className="ic-pill"
                  style={{
                    display: "inline-flex",
                    gap: 4,
                    alignItems: "center",
                    color: "var(--via-color-text-muted)",
                  }}
                >
                  <AlertTriangle size={10} />
                  Não configurado
                </span>
              )}
            </div>
            <div className="ic-card-sub">{integration.tagline}</div>
          </div>
        </div>

        <button
          type="button"
          className="ic-btn ic-btn-secondary"
          onClick={() => onOpenHowTo(integration.id)}
          title="Como obter a chave"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <HelpCircle size={14} />
          Como obter
        </button>
      </div>

      <div className="ic-card-body">
        {!editing ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {integration.hasLovableConnector && !isConfigured && (
              <button
                type="button"
                className="ic-btn ic-btn-blue"
                onClick={() => {
                  const msg = `Conectar ${integration.name} via Lovable`;
                  navigator.clipboard?.writeText(msg).catch(() => {});
                  toast.info(
                    `Abra o chat do Lovable e envie: "${msg}" — copiamos para sua área de transferência.`,
                    { duration: 6000 },
                  );
                }}
                title="Peça no chat do Lovable para abrir o conector"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Zap size={14} />
                Conectar via Lovable
              </button>
            )}
            {isConfigured && (
              <button
                type="button"
                className="ic-btn ic-btn-secondary"
                onClick={handleTestStored}
                disabled={testStoredMut.isPending}
                title="Faz uma chamada de teste à API do provedor"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Activity size={14} />
                {testStoredMut.isPending ? "Testando…" : "Testar conexão"}
              </button>
            )}
            <button
              type="button"
              className={
                isConfigured ? "ic-btn ic-btn-secondary" : "ic-btn ic-btn-blue"
              }
              onClick={() => setEditing(true)}
            >
              {isConfigured ? "Trocar chave" : "Colar API key"}
            </button>
            {isConfigured && (
              <button
                type="button"
                className="ic-iconbtn"
                onClick={handleRemove}
                disabled={deleteMut.isPending}
                title="Remover chave"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ApiKeyInput
              value={keyValue}
              onChange={setKeyValue}
              placeholder={
                integration.keyPrefix
                  ? `${integration.keyPrefix}…`
                  : "Cole sua API key"
              }
              disabled={testMut.isPending || saveMut.isPending}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="ic-btn ic-btn-secondary"
                onClick={() => {
                  setEditing(false);
                  setKeyValue("");
                }}
                disabled={testMut.isPending || saveMut.isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ic-btn ic-btn-blue"
                onClick={handleTestAndSave}
                disabled={
                  keyValue.trim().length < 8 ||
                  testMut.isPending ||
                  saveMut.isPending
                }
              >
                {testMut.isPending
                  ? "Testando…"
                  : saveMut.isPending
                    ? "Salvando…"
                    : "Testar e salvar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
