import { Link } from "@tanstack/react-router";

import { useMyProfile } from "@/lib/use-my-profile";

type Tab = {
  id: "account" | "integrations" | "team";
  label: string;
  to: "/settings" | "/settings/integrations" | "/settings/equipe";
  adminOnly?: boolean;
};

const TABS: Tab[] = [
  { id: "account", label: "Conta · LLM", to: "/settings" },
  { id: "integrations", label: "Integrações", to: "/settings/integrations" },
  { id: "team", label: "Equipe", to: "/settings/equipe", adminOnly: true },
];

export function SettingsSubnav({ active }: { active: Tab["id"] }) {
  const profileQ = useMyProfile();
  const isAdmin = profileQ.data?.role === "admin";
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        background: "var(--via-bg-2, #f5f7fb)",
        border: "1px solid var(--via-navy-15)",
        borderRadius: 10,
        marginTop: 4,
        marginBottom: 8,
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <Link
            key={t.id}
            to={t.to}
            style={{
              padding: "8px 14px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
              background: isActive ? "var(--via-color-bg-surface, #fff)" : "transparent",
              color: isActive ? "var(--via-navy)" : "var(--via-color-text-muted)",
              boxShadow: isActive ? "var(--via-shadow-raised)" : "none",
              transition: "all 120ms",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
