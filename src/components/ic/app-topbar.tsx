import { Search, Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DemoModeToggle } from "./demo-mode-toggle";
import { ThemeToggle } from "./theme-toggle";

type Props = {
  title: string;
  subtitle?: string;
  alertsCount?: number;
  right?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Quando ausente, o campo de busca nao e renderizado. */
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
};

export function AppTopbar({
  title,
  subtitle,
  alertsCount = 0,
  right,
  trailing,
  onSearchChange,
  searchPlaceholder,
}: Props) {
  return (
    <header className="ic-topbar">
      <div>
        {subtitle && <div className="ic-topbar-sub">{subtitle}</div>}
        <h1 className="ic-topbar-title">{title}</h1>
      </div>
      <div className="ic-topbar-actions">
        {/* A busca so aparece onde alguem realmente filtra. O campo estava em
            todas as 11 telas com `onSearchChange` opcional e NENHUMA o
            passava: dava para digitar em qualquer lugar e nada acontecia.
            O selo ⌘K saiu junto -- prometia um atalho que nao existe. */}
        {onSearchChange && (
          <div className="ic-search">
            <Search size={14} strokeWidth={1.75} />
            <input
              placeholder={searchPlaceholder ?? "Buscar…"}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        )}
        {right}
        <DemoModeToggle />
        <ThemeToggle />
        {/* Era um botao sem onClick: o sino nao levava a lugar nenhum. */}
        <Link to="/alerts" className="ic-iconbtn" title="Alertas" aria-label="Alertas">
          <Bell size={16} strokeWidth={1.75} />
          {alertsCount > 0 && <span className="dot" />}
        </Link>
        {trailing}
      </div>
    </header>
  );
}
