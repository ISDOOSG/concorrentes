import { useEffect } from "react";
import { X } from "lucide-react";
import type { IntegrationContent } from "@/content/integrations/types";

type Props = {
  open: boolean;
  integration: IntegrationContent | null;
  onClose: () => void;
};

export function HowToObtainSheet({ open, integration, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !integration) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,22,42,0.45)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: "100%",
          height: "100%",
          background: "var(--via-color-bg-surface, #fff)",
          boxShadow: "var(--via-shadow-raised)",
          display: "flex",
          flexDirection: "column",
          animation: "slide-in-right 220ms ease-out",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 22px",
            borderBottom: "1px solid var(--via-navy-15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>{integration.emoji}</span>
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: "var(--via-navy)",
                }}
              >
                Como obter sua chave {integration.name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--via-color-text-muted)",
                }}
              >
                {integration.tagline}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid var(--via-navy-15)",
              color: "var(--via-color-text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </header>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 22,
          }}
        >
          {integration.content}
        </div>
      </aside>
    </div>
  );
}
