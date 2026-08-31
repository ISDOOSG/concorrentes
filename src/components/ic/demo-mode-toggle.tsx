import { FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { useDemoMode } from "@/lib/data/use-demo-mode";

export function DemoModeToggle() {
  const { enabled, toggle } = useDemoMode();

  const handleClick = () => {
    toggle();
    if (!enabled) {
      // estava off, vai pra on
      toast.info(
        "Modo demonstração ativado — usando dados simulados localmente",
      );
    } else {
      toast.success("Modo demonstração desativado — usando seu banco real");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={
        enabled
          ? "Desativar modo demonstração (volta a usar seu banco real)"
          : "Ativar modo demonstração (dados simulados, ideal para explorar)"
      }
      aria-pressed={enabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        padding: "0 12px",
        borderRadius: 8,
        border: "1px solid",
        borderColor: enabled ? "var(--via-warning)" : "var(--via-navy-15)",
        background: enabled ? "var(--via-warning-bg)" : "var(--via-color-bg-surface)",
        color: enabled ? "var(--via-warning)" : "var(--via-color-text-muted)",
        fontFamily: "var(--via-font)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: "pointer",
        transition:
          "border-color var(--via-transition), background var(--via-transition), color var(--via-transition)",
      }}
    >
      <FlaskConical size={14} strokeWidth={1.75} />
      {enabled ? "Demo ON" : "Demo"}
    </button>
  );
}
