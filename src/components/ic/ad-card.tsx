import { Image as ImageIcon, Video, ExternalLink, Calendar } from "lucide-react";

import type { Ad } from "@/lib/ic-mock";

type Props = {
  ad: Ad;
};

const SOURCE_LABEL: Record<Ad["source"], string> = {
  meta: "Meta Ads",
  google: "Google Ads",
};

const SOURCE_COLOR: Record<Ad["source"], string> = {
  meta: "var(--via-util-1)",
  google: "var(--via-util-3)",
};

function fmtSpend(spend: Ad["spend_estimate"]): string {
  if (!spend) return "—";
  const cur = spend.currency ?? "BRL";
  const lo = spend.lower_bound;
  const hi = spend.upper_bound;
  if (lo == null && hi == null) return "—";
  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(v);
  if (lo != null && hi != null) return `${fmt(lo)}–${fmt(hi)}`;
  return fmt((lo ?? hi) as number);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function AdCard({ ad }: Props) {
  const firstCreative = ad.creatives[0];
  const isVideo = firstCreative?.type === "video";
  const previewUrl = firstCreative?.thumbnail || firstCreative?.url || null;
  const hasMedia = !!previewUrl;

  // Status tri-state: true → Ativo, false → Pausado, null → Veiculando (indeterminado)
  const statusLabel =
    ad.active === true ? "Ativo" : ad.active === false ? "Pausado" : "Veiculando";
  const statusClass =
    ad.active === true ? "success" : ad.active === false ? "low" : "blue";
  const statusTitle =
    ad.active === null
      ? "API básica não confirma status individual; o anúncio aparece no Google Ads Transparency."
      : undefined;

  // Format badge — inferred from creative type or video flag
  const formatLabel = isVideo ? "VIDEO" : hasMedia ? "IMAGE" : null;

  return (
    <div
      className="ic-card"
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: ad.active === false ? 0.6 : 1,
      }}
    >
      {/* Header — source + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--via-navy-15)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: SOURCE_COLOR[ad.source],
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: SOURCE_COLOR[ad.source],
            }}
          />
          {SOURCE_LABEL[ad.source]}
        </span>
        <span
          className={`ic-pill ${statusClass}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          title={statusTitle}
        >
          {statusLabel}
        </span>
      </div>

      {/* Creative preview — real thumbnail when available, else placeholder + Transparency link */}
      <a
        href={ad.cta_url ?? "#"}
        target={ad.cta_url ? "_blank" : undefined}
        rel="noreferrer"
        style={{
          aspectRatio: "16/9",
          background: hasMedia
            ? "var(--via-bg-2)"
            : "linear-gradient(135deg, var(--via-bg-2) 0%, rgba(2,22,42,0.04) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--via-color-text-muted)",
          position: "relative",
          textDecoration: "none",
          cursor: ad.cta_url ? "pointer" : "default",
        }}
        onClick={(e) => {
          if (!ad.cta_url) e.preventDefault();
        }}
      >
        {hasMedia ? (
          <img
            src={previewUrl!}
            alt={ad.body_text || "Criativo"}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : isVideo ? (
          <Video size={32} strokeWidth={1.5} />
        ) : (
          <ImageIcon size={32} strokeWidth={1.5} />
        )}
        {isVideo && hasMedia && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(2,22,42,0.25)",
            }}
          >
            <Video size={28} color="white" strokeWidth={2} />
          </span>
        )}
        {formatLabel && (
          <span
            style={{
              position: "absolute",
              top: 8,
              left: 10,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "white",
              background: "rgba(2,22,42,0.65)",
              padding: "2px 6px",
              borderRadius: 3,
            }}
          >
            {formatLabel}
          </span>
        )}
        {!hasMedia && ad.cta_url && (
          <span
            style={{
              position: "absolute",
              bottom: 8,
              left: 10,
              right: 10,
              textAlign: "center",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--via-blue)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <ExternalLink size={10} />
            Ver no Google Ads Transparency
          </span>
        )}
      </a>

      {/* Body */}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            fontSize: 13,
            color: "var(--via-color-text-body)",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {ad.body_text || "Sem texto"}
        </div>

        {ad.cta_text && (
          <a
            href={ad.cta_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="ic-btn ic-btn-secondary"
            style={{
              alignSelf: "flex-start",
              fontSize: 11,
              padding: "6px 12px",
              height: 28,
              textDecoration: "none",
            }}
          >
            <ExternalLink size={11} />
            {ad.cta_text}
          </a>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            fontSize: 11,
            color: "var(--via-color-text-muted)",
            paddingTop: 8,
            borderTop: "1px dashed var(--via-navy-15)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--via-color-text-muted)",
                marginBottom: 2,
              }}
            >
              Gasto estimado
            </div>
            <div style={{ color: "var(--via-navy)", fontWeight: 700, fontSize: 12 }}>
              {fmtSpend(ad.spend_estimate)}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--via-color-text-muted)",
                marginBottom: 2,
              }}
            >
              <Calendar size={9} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
              {ad.end_date ? "Veiculação" : "Início"}
            </div>
            <div style={{ color: "var(--via-navy)", fontWeight: 700, fontSize: 12 }}>
              {ad.end_date
                ? `${fmtDate(ad.start_date)} → ${fmtDate(ad.end_date)}`
                : fmtDate(ad.start_date)}
            </div>
          </div>
        </div>

        {(ad.targeting?.countries?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {ad.targeting?.countries?.slice(0, 5).map((c) => (
              <span key={c} className="ic-tag">
                {c}
              </span>
            ))}
          </div>
        )}

        {ad.platforms.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {ad.platforms.map((p) => (
              <span
                key={p}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--via-color-text-muted)",
                  background: "var(--via-bg-2)",
                  padding: "2px 6px",
                  borderRadius: 3,
                }}
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
