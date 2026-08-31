import {
  LayoutDashboard,
  Building,
  Columns3,
  Bell,
  ShieldCheck,
  PlusCircle,
  Settings,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItemId =
  | "dashboard"
  | "competitors"
  | "compare"
  | "alerts"
  | "swot"
  | "onboard"
  | "settings"
  | "help";

type NavItem = {
  id: NavItemId;
  icon: LucideIcon;
  label: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Monitoramento",
    items: [
      { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { id: "competitors", icon: Building, label: "Concorrentes" },
      { id: "compare", icon: Columns3, label: "Comparar" },
      { id: "alerts", icon: Bell, label: "Alertas" },
    ],
  },
  {
    label: "Inteligência",
    items: [{ id: "swot", icon: ShieldCheck, label: "Análise SWOT" }],
  },
  {
    label: "Configuração",
    items: [
      { id: "onboard", icon: PlusCircle, label: "Adicionar concorrente" },
      { id: "settings", icon: Settings, label: "Configurações" },
      { id: "help", icon: HelpCircle, label: "Ajuda" },
    ],
  },
];

type Props = {
  current: NavItemId;
  onNavigate: (id: NavItemId) => void;
  counts?: Partial<Record<NavItemId, number>>;
  userInitials?: string;
  userName?: string;
  userPlan?: string;
};

export function AppSidebar({
  current,
  onNavigate,
  counts,
  userInitials = "AC",
  userName = "Sua conta",
  userPlan = "Plano Free",
}: Props) {
  return (
    <aside className="ic-sidebar">
      <div className="ic-brand">
        <div className="ic-brand-mark">AC</div>
        <div>
          <div className="ic-brand-name">Análise de</div>
          <div className="ic-brand-name">Concorrentes</div>
          <div className="ic-brand-sub">Viver de IA</div>
        </div>
      </div>
      <nav className="ic-nav">
        {NAV_SECTIONS.map((sec) => (
          <div key={sec.label}>
            <div className="ic-nav-section">{sec.label}</div>
            {sec.items.map((it) => {
              const Icon = it.icon;
              const count = counts?.[it.id];
              return (
                <button
                  key={it.id}
                  type="button"
                  className={cn("ic-nav-item", current === it.id && "active")}
                  onClick={() => onNavigate(it.id)}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  <span>{it.label}</span>
                  {count != null && count > 0 && (
                    <span className="count">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="ic-sidebar-foot">
        <div className="ic-avatar">{userInitials}</div>
        <div>
          <div className="ic-avatar-name">{userName}</div>
          <div className="ic-avatar-role">{userPlan}</div>
        </div>
      </div>
    </aside>
  );
}
