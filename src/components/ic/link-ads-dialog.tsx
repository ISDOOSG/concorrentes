import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";

import {
  useAdsLinkSuggestion,
  useLinkCompetitorAds,
  useTriggerSuggestAdsLinks,
} from "@/lib/data/hooks/use-ads";
import { toastDataError } from "@/lib/data/error-toast";
import type { Competitor } from "@/lib/ic-mock";

// Aceita URL completa do FB ou page_id puro. Extrai o último segmento
// não-numérico OU id numérico.
function extractFacebookPageId(input: string): string {
  const v = input.trim();
  if (!v) return "";
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    if (u.hostname.includes("facebook.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 1) {
        const last = parts[parts.length - 1];
        return /^\d+$/.test(last) ? last : parts[0];
      }
    }
  } catch {
    /* not a URL, treat as raw id/username */
  }
  return v;
}

// Aceita: URL com /advertiser/AR…, ou ID puro AR\d+. Rejeita URLs de busca
// (ex: ?domain=…) — esse caso é tratado automaticamente pelo backend usando
// o domínio do site cadastrado.
function extractGoogleAdvertiserId(input: string): string | null {
  const v = input.trim();
  if (!v) return "";
  // ID puro
  if (/^AR\d+$/i.test(v)) return v.toUpperCase();
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    if (u.hostname.includes("adstransparency.google.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("advertiser");
      if (idx >= 0 && parts[idx + 1] && /^AR\d+$/i.test(parts[idx + 1])) {
        return parts[idx + 1].toUpperCase();
      }
    }
  } catch {
    /* not a URL */
  }
  // Não conseguimos extrair um Advertiser ID válido (formato AR + dígitos)
  return null;
}

const schema = z.object({
  facebook: z.string().trim().optional().default(""),
  google: z.string().trim().optional().default(""),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

type Props = {
  comp: Competitor;
  initial?: {
    facebookPageId?: string | null;
    googleAdvertiserId?: string | null;
  };
  onClose: () => void;
};

function confidenceLabel(c: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (c >= 0.85)
    return {
      label: "Alta confiança",
      color: "var(--via-success)",
      bg: "var(--via-success-bg)",
    };
  if (c >= 0.6)
    return {
      label: "Confiança média — confira",
      color: "var(--via-warning)",
      bg: "var(--via-warning-bg)",
    };
  return {
    label: "Baixa confiança — verifique",
    color: "var(--via-color-text-muted)",
    bg: "var(--via-bg-2)",
  };
}

export function LinkAdsDialog({ comp, initial, onClose }: Props) {
  const linkMut = useLinkCompetitorAds();
  const suggestionQ = useAdsLinkSuggestion(comp.id);
  const suggestMut = useTriggerSuggestAdsLinks();
  const [submitting, setSubmitting] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  const sug = suggestionQ.data;
  const isSuggesting = suggestMut.isPending;

  // Pré-fill: prioridade pra valor já vinculado (initial). Se não tiver,
  // usa sugestão. Se não tiver nem, vazio.
  const fbDefault = initial?.facebookPageId ?? sug?.facebookPageId ?? "";
  const googleDefault =
    initial?.googleAdvertiserId ?? sug?.googleAdvertiserId ?? "";

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      facebook: fbDefault,
      google: googleDefault,
    },
    values: {
      facebook: fbDefault,
      google: googleDefault,
    },
  });

  const submit = form.handleSubmit(async (input) => {
    setSubmitting(true);
    try {
      const fb = input.facebook ? extractFacebookPageId(input.facebook) : null;
      let g: string | null = null;
      if (input.google && input.google.trim()) {
        const extracted = extractGoogleAdvertiserId(input.google);
        if (extracted === null) {
          form.setError("google", {
            type: "manual",
            message:
              "Cole a URL do anunciante (/advertiser/AR…) ou o ID AR… direto. URLs de busca por domínio não funcionam — deixe vazio para usar o site cadastrado.",
          });
          setSubmitting(false);
          return;
        }
        g = extracted || null;
      }
      await linkMut.mutateAsync({
        competitorId: comp.id,
        facebookPageId: fb || null,
        googleAdvertiserId: g,
      });
      toast.success("Vínculo de ads salvo");
      onClose();
    } catch (err) {
      toastDataError(err, "Falha ao salvar vínculo");
    } finally {
      setSubmitting(false);
    }
  });

  const acceptAll = () => {
    if (!sug) return;
    form.setValue("facebook", sug.facebookPageId ?? "", { shouldDirty: true });
    form.setValue("google", sug.googleAdvertiserId ?? "", {
      shouldDirty: true,
    });
  };

  const hasUsefulSuggestion =
    !!sug && (sug.facebookPageId != null || sug.googleAdvertiserId != null);
  const fbConf = sug?.confidence.meta ?? 0;
  const googleConf = sug?.confidence.google ?? 0;
  const fbBadge = sug?.facebookPageId ? confidenceLabel(fbConf) : null;
  const googleBadge = sug?.googleAdvertiserId
    ? confidenceLabel(googleConf)
    : null;

  return (
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
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "100%",
          background: "var(--via-color-bg-surface)",
          borderRadius: 14,
          padding: 28,
          boxShadow: "var(--via-shadow-raised)",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "var(--via-navy)",
            marginBottom: 6,
          }}
        >
          Vincular anúncios — {comp.name}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--via-color-text-muted)",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          Vincule a Facebook Page e/ou o Google Advertiser pra coletarmos os
          anúncios ativos via ScrapeCreators. Pode preencher só um dos dois (ou
          ambos).
        </p>

        {!hasUsefulSuggestion && !suggestionQ.isLoading && (
          <div
            style={{
              background: "rgba(10,79,149,0.04)",
              border: "1px dashed rgba(10,79,149,0.3)",
              borderRadius: 10,
              padding: 14,
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Sparkles
              size={20}
              strokeWidth={1.75}
              style={{ color: "var(--via-blue)", flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--via-navy)",
                  marginBottom: 2,
                }}
              >
                Buscar sugestão automática
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--via-color-text-muted)",
                  lineHeight: 1.4,
                }}
              >
                Cruzamos o site, Meta Ad Library e Google Ads Transparency com
                IA pra detectar Page e Advertiser oficiais.
              </div>
            </div>
            <button
              type="button"
              className="ic-btn ic-btn-blue"
              disabled={isSuggesting}
              onClick={() =>
                suggestMut.mutate(comp.id, {
                  onSuccess: (data) => {
                    if (
                      data &&
                      (data.facebookPageId || data.googleAdvertiserId)
                    ) {
                      toast.success("Sugestões geradas");
                    } else {
                      toast.info(
                        "Não conseguimos identificar a Page nem o Advertiser. Cole manualmente.",
                      );
                    }
                  },
                  onError: (err) => toastDataError(err),
                })
              }
            >
              {isSuggesting ? (
                <>
                  <span
                    className="auth-btn-spinner"
                    style={{ width: 12, height: 12, marginRight: 0 }}
                  />
                  Buscando…
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  Buscar
                </>
              )}
            </button>
          </div>
        )}

        {hasUsefulSuggestion && (
          <div
            style={{
              background: "rgba(10,79,149,0.06)",
              border: "1px solid rgba(10,79,149,0.18)",
              borderRadius: 10,
              padding: 14,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Sparkles
                size={14}
                strokeWidth={2.2}
                style={{ color: "var(--via-blue)" }}
              />
              <strong style={{ fontSize: 13, color: "var(--via-navy)" }}>
                Sugestão automática
              </strong>
              <button
                type="button"
                className="ic-btn ic-btn-secondary ic-btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={isSuggesting}
                onClick={() =>
                  suggestMut.mutate(comp.id, {
                    onSuccess: () => toast.success("Sugestões atualizadas"),
                    onError: (err) => toastDataError(err),
                  })
                }
              >
                {isSuggesting ? "Atualizando…" : "Atualizar"}
              </button>
              <button
                type="button"
                className="ic-btn ic-btn-blue ic-btn-sm"
                onClick={acceptAll}
                disabled={isSuggesting}
              >
                Aceitar sugestões
              </button>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--via-color-text-body)",
                lineHeight: 1.5,
              }}
            >
              Identificamos os candidatos abaixo cruzando o site do
              concorrente, busca no Meta Ad Library e Google Ads Transparency,
              e IA pra desempate.
            </div>
            {sug?.reasoning && (
              <button
                type="button"
                onClick={() => setShowReasoning((v) => !v)}
                style={{
                  marginTop: 8,
                  background: "transparent",
                  border: "none",
                  color: "var(--via-blue)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {showReasoning ? (
                  <ChevronUp size={11} />
                ) : (
                  <ChevronDown size={11} />
                )}
                {showReasoning ? "Ocultar raciocínio" : "Ver raciocínio da IA"}
              </button>
            )}
            {showReasoning && sug?.reasoning && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "var(--via-color-text-muted)",
                  fontStyle: "italic",
                  lineHeight: 1.5,
                  borderLeft: "2px solid var(--via-blue)",
                  paddingLeft: 10,
                }}
              >
                {sug.reasoning}
              </div>
            )}
          </div>
        )}

        <div className="via-field" style={{ marginBottom: 14 }}>
          <label className="via-label-text" htmlFor="link-fb">
            URL da Facebook Page (ou ID)
          </label>
          <input
            id="link-fb"
            type="text"
            autoComplete="off"
            className="via-input"
            placeholder="https://facebook.com/rdstation"
            {...form.register("facebook")}
          />
          {fbBadge && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: fbBadge.color,
                background: fbBadge.bg,
                padding: "2px 8px",
                borderRadius: 4,
                marginTop: 6,
              }}
            >
              {fbBadge.label} · {Math.round(fbConf * 100)}%
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              color: "var(--via-color-text-muted)",
              marginTop: 4,
              display: "block",
            }}
          >
            Aceita URL completa, username (ex: <code>rdstation</code>) ou ID
            numérico.
          </span>
        </div>

        <div className="via-field" style={{ marginBottom: 22 }}>
          <label className="via-label-text" htmlFor="link-google">
            Google Advertiser (URL ou ID)
          </label>
          <input
            id="link-google"
            type="text"
            autoComplete="off"
            className="via-input"
            placeholder="https://adstransparency.google.com/advertiser/AR123…"
            {...form.register("google")}
          />
          {googleBadge && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: googleBadge.color,
                background: googleBadge.bg,
                padding: "2px 8px",
                borderRadius: 4,
                marginTop: 6,
              }}
            >
              {googleBadge.label} · {Math.round(googleConf * 100)}%
            </span>
          )}
          {form.formState.errors.google && (
            <span
              role="alert"
              style={{
                fontSize: 11,
                color: "var(--via-danger, #b00020)",
                marginTop: 4,
                display: "block",
                lineHeight: 1.4,
              }}
            >
              {form.formState.errors.google.message}
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              color: "var(--via-color-text-muted)",
              marginTop: 4,
              display: "block",
              lineHeight: 1.4,
            }}
          >
            <strong>Opcional.</strong> Se vazio, buscamos automaticamente pelo
            domínio do site cadastrado. Pra precisão maior, cole a URL{" "}
            <code>/advertiser/AR…</code> ou o ID <code>AR…</code> direto.
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="ic-btn ic-btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="ic-btn ic-btn-blue"
            disabled={submitting}
          >
            {submitting ? "Salvando…" : "Salvar vínculo"}
          </button>
        </div>
      </form>
    </div>
  );
}
