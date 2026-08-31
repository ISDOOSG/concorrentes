import { Search, Bell, Download } from "lucide-react";
import { DemoModeToggle } from "./demo-mode-toggle";
import { ThemeToggle } from "./theme-toggle";

type Props = {
  title: string;
  subtitle?: string;
  alertsCount?: number;
  right?: React.ReactNode;
  trailing?: React.ReactNode;
  onSearchChange?: (q: string) => void;
};

export function AppTopbar({
  title,
  subtitle,
  alertsCount = 0,
  right,
  trailing,
  onSearchChange,
}: Props) {
  return (
    <header className="ic-topbar">
      <div>
        {subtitle && <div className="ic-topbar-sub">{subtitle}</div>}
        <h1 className="ic-topbar-title">{title}</h1>
      </div>
      <div className="ic-topbar-actions">
        <div className="ic-search">
          <Search size={14} strokeWidth={1.75} />
          <input
            placeholder="Buscar concorrente, mudança ou keyword…"
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 3,
              background: "rgba(2,22,42,0.08)",
              color: "var(--via-color-text-muted)",
              fontWeight: 700,
              letterSpacing: "0.06em",
            }}
          >
            ⌘K
          </span>
        </div>
        {right}
        <DemoModeToggle />
        <ThemeToggle />
        <button type="button" className="ic-iconbtn" title="Alertas">
          <Bell size={16} strokeWidth={1.75} />
          {alertsCount > 0 && <span className="dot" />}
        </button>
        <button type="button" className="ic-iconbtn" title="Exportar">
          <Download size={16} strokeWidth={1.75} />
        </button>
        {trailing}
      </div>
    </header>
  );
}
