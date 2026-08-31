import { Loader2, Check, AlertTriangle, Clock } from "lucide-react";

import type { Competitor, CrawlStatus } from "@/lib/ic-mock";

type Props = {
  competitor: Pick<Competitor, "crawlStatus" | "crawlError" | "lastChange">;
  onShowError?: () => void;
};

const LABELS: Record<CrawlStatus, string> = {
  never: "Aguardando",
  queued: "Na fila",
  running: "Crawleando…",
  success: "OK",
  failed: "Falhou",
};

export function CrawlStatusBadge({ competitor, onShowError }: Props) {
  const status: CrawlStatus = competitor.crawlStatus ?? "never";
  const label = LABELS[status];

  if (status === "running" || status === "queued") {
    return (
      <span
        className="ic-pill blue"
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <Loader2
          size={10}
          strokeWidth={2.5}
          style={{ animation: "auth-spin 1s linear infinite" }}
        />
        {label}
      </span>
    );
  }

  if (status === "success") {
    return (
      <span
        className="ic-pill success"
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <Check size={10} strokeWidth={2.5} />
        {label}
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          className="ic-pill high"
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <AlertTriangle size={10} strokeWidth={2.5} />
          {label}
        </span>
        {onShowError && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowError();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--via-blue)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              cursor: "pointer",
              padding: 0,
              fontFamily: "var(--via-font)",
            }}
          >
            Ver erro
          </button>
        )}
      </span>
    );
  }

  // never
  return (
    <span
      className="ic-pill low"
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <Clock size={10} strokeWidth={2.5} />
      {label}
    </span>
  );
}
