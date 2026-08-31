import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plug, RefreshCw, FlaskConical, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useAds, useFetchAds } from "@/lib/data/hooks/use-ads";
import { toastDataError } from "@/lib/data/error-toast";
import type { Ad, AdSource, Competitor } from "@/lib/ic-mock";

import { AdCard } from "./ad-card";
import { Skeleton } from "./skeleton";

type Filter = "all" | AdSource;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "meta", label: "Meta Ads" },
  { id: "google", label: "Google Ads" },
];

type Props = {
  comp: Competitor;
};

type LastFetch = {
  metaCount?: number;
  googleCount?: number;
  notes?: string[];
  sources?: { meta?: string; google?: string };
  withDetails?: boolean;
} | null;

export function AdsTab({ comp }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [lastFetch, setLastFetch] = useState<LastFetch>(null);
  const adsQ = useAds(comp.id);
  const fetchMut = useFetchAds();

  const ads: Ad[] = adsQ.data ?? [];
  const filtered = ads.filter((a) => filter === "all" || a.source === filter);
  const hasAds = ads.length > 0;

  const triggerFetch = (withDetails: boolean) => {
    fetchMut.mutate(
      { competitorId: comp.id, withDetails },
      {
        onSuccess: (res) => {
          const extraNotes = [...(res.notes ?? [])];
          if (!withDetails && (res.googleCount ?? 0) > 0) {
            extraNotes.unshift(
              "Busca rápida (1 cr.) não retorna preview do criativo nem confirma status individual de cada anúncio. Use 'Com criativos (25 cr.)' para imagens detalhadas, ou clique em cada card para abrir no Google Ads Transparency.",
            );
          }
          setLastFetch({
            metaCount: res.metaCount,
            googleCount: res.googleCount,
            notes: extraNotes,
            sources: res.sources,
            withDetails: res.withDetails,
          });
          const total = (res.metaCount ?? 0) + (res.googleCount ?? 0);
          if (total > 0) {
            toast.success(
              `Encontramos ${total} anúncio${total === 1 ? "" : "s"} de ${comp.name}.`,
            );
          } else {
            toast.info(
              `Busca concluída — nenhum anúncio público encontrado para ${comp.name}.`,
            );
          }
        },
        onError: (err) => toastDataError(err),
      },
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={cn(
                "ic-btn ic-btn-sm",
                filter === f.id ? "ic-btn-primary" : "ic-btn-secondary",
              )}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className="ic-btn ic-btn-secondary"
            disabled={fetchMut.isPending}
            title="Busca completa com imagens/vídeos dos criativos. Custa 25 créditos ScrapeCreators por chamada."
            onClick={() => {
              if (
                window.confirm(
                  "Buscar com criativos completos consome ~25 créditos ScrapeCreators por chamada (vs. 1 crédito da busca rápida). Continuar?",
                )
              ) {
                triggerFetch(true);
              }
            }}
          >
            <Sparkles size={12} />
            Com criativos (25 cr.)
          </button>
          <button
            type="button"
            className="ic-btn ic-btn-blue"
            disabled={fetchMut.isPending}
            onClick={() => triggerFetch(false)}
          >
            <RefreshCw
              size={12}
              style={
                fetchMut.isPending
                  ? { animation: "auth-spin 0.8s linear infinite" }
                  : undefined
              }
            />
            {fetchMut.isPending ? "Buscando…" : "Buscar (1 cr.)"}
          </button>
        </div>
      </div>

      {lastFetch && (lastFetch.notes?.length || lastFetch.sources) && (
        <div
          style={{
            background: "rgba(10,79,149,0.05)",
            border: "1px solid rgba(10,79,149,0.18)",
            borderRadius: 10,
            padding: 12,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <Info
            size={16}
            strokeWidth={1.75}
            style={{ color: "var(--via-blue)", flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ fontSize: 12, color: "var(--via-color-text-body)", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, color: "var(--via-navy)", marginBottom: 4 }}>
              Última busca: {lastFetch.metaCount ?? 0} no Meta · {lastFetch.googleCount ?? 0} no Google
              {lastFetch.withDetails ? " · com criativos" : ""}
            </div>
            {lastFetch.sources && (
              <div style={{ fontSize: 11, color: "var(--via-color-text-muted)", marginBottom: 4 }}>
                Fontes:{" "}
                {lastFetch.sources.meta && <code>{lastFetch.sources.meta}</code>}
                {lastFetch.sources.meta && lastFetch.sources.google && " · "}
                {lastFetch.sources.google && <code>{lastFetch.sources.google}</code>}
              </div>
            )}
            {lastFetch.notes && lastFetch.notes.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {lastFetch.notes.map((n, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {adsQ.isLoading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="ic-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: 14 }}>
                <Skeleton width={80} height={14} style={{ marginBottom: 12 }} />
              </div>
              <Skeleton width="100%" height={140} rounded={0} />
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton width="100%" height={12} />
                <Skeleton width="80%" height={12} />
                <Skeleton width="60%" height={12} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!adsQ.isLoading && !hasAds && <NoAdsYet comp={comp} />}

      {!adsQ.isLoading && hasAds && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
          {filtered.length === 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: 28,
                textAlign: "center",
                color: "var(--via-color-text-muted)",
                fontSize: 13,
              }}
            >
              Nenhum ad com esse filtro.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoAdsYet({ comp }: { comp: Competitor }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--via-blue-light)",
          color: "var(--via-blue)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Plug size={24} strokeWidth={1.75} />
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 900,
          color: "var(--via-navy)",
          marginTop: 4,
        }}
      >
        Sem anúncios coletados ainda
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--via-color-text-muted)",
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        Para ver os anúncios ativos de {comp.name} no Meta Ads e Google Ads,
        vincule a Facebook Page e/ou Google Advertiser ID na seção
        "Vincular ads" e configure sua chave ScrapeCreators em{" "}
        <Link to="/settings/integrations">/settings/integrations</Link>.
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 12,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Link
          to="/settings/integrations"
          className="ic-btn ic-btn-blue"
          style={{ textDecoration: "none" }}
        >
          <Plug size={12} />
          Configurar ScrapeCreators
        </Link>
        <span
          style={{
            fontSize: 11,
            color: "var(--via-color-text-muted)",
            alignSelf: "center",
            fontStyle: "italic",
          }}
        >
          ou ative{" "}
          <FlaskConical
            size={11}
            style={{ display: "inline", verticalAlign: "middle" }}
          />{" "}
          <strong>Modo Demo</strong> pra ver dados simulados
        </span>
      </div>
    </div>
  );
}
