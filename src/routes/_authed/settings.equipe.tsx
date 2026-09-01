import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Mail, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/ic/app-topbar";
import { UserMenu } from "@/components/ic/user-menu";
import { SettingsSubnav } from "@/components/ic/settings-subnav";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useMyProfile } from "@/lib/use-my-profile";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import { apiFetch, ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/_authed/settings/equipe")({
  component: TeamPage,
});

type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
};

type Invite = {
  id: string;
  email: string;
  created_at: string;
  accepted_at: string | null;
};

function inviteLink(id: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/convite?id=${id}`;
}

function TeamPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const profileQ = useMyProfile();
  const [email, setEmail] = useState("");

  const isAdmin = profileQ.data?.role === "admin";

  const membersQ = useQuery({
    queryKey: ["team-members"],
    queryFn: () => apiFetch<Member[]>("/team/members"),
    enabled: isAdmin,
  });

  const invitesQ = useQuery({
    queryKey: ["team-invites"],
    queryFn: () => apiFetch<Invite[]>("/team/invites"),
    enabled: isAdmin,
  });

  const inviteMut = useMutation({
    mutationFn: (target: string) =>
      apiFetch<{ id: string; email: string }>("/team/invites", {
        method: "POST",
        body: JSON.stringify({ email: target }),
      }),
    onSuccess: (d) => {
      const link = inviteLink(d.id);
      navigator.clipboard?.writeText(link).catch(() => {});
      toast.success(
        `Convite criado para ${d.email}. O link já foi copiado — envie você mesmo.`,
      );
      setEmail("");
      qc.invalidateQueries({ queryKey: ["team-invites"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Falha ao criar o convite"),
  });

  const removeInviteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/team/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-invites"] }),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Falha ao remover o convite"),
  });

  const copyInvite = (id: string) => {
    navigator.clipboard?.writeText(inviteLink(id)).catch(() => {});
    toast.success("Link copiado.");
  };

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  return (
    <>
      <AppTopbar
        title="Configurações"
        subtitle="Sua conta · LLM · Monitoramento"
        alertsCount={alertsQ.data?.length ?? 0}
        trailing={
          authed ? (
            <UserMenu
              email={authed.email}
              fullName={authed.fullName}
              onLogout={handleLogout}
            />
          ) : null
        }
      />
      <div className="ic-content">
        <SettingsSubnav active="team" />

        {!profileQ.isLoading && !isAdmin ? (
          <div className="ic-card" style={{ padding: 24, marginTop: 8 }}>
            Apenas o administrador da plataforma gerencia a equipe.
          </div>
        ) : (
          <>
            <div className="ic-insight" style={{ marginTop: 8 }}>
              <div className="ic-insight-mark">
                <ShieldCheck size={14} strokeWidth={2.2} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="ic-insight-title" style={{ marginBottom: 4 }}>
                  Acesso por convite
                </div>
                <div className="ic-insight-body">
                  O cadastro direto está bloqueado: novos usuários só entram por
                  convite. Ao convidar, o link já é copiado para sua área de
                  transferência — envie você mesmo por WhatsApp ou e-mail. A
                  pessoa abre o link, define a senha e já cai na plataforma.
                </div>
              </div>
            </div>

            <div className="ic-section-head" style={{ marginTop: 20 }}>
              <div className="ic-section-title">Convidar usuário</div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = email.trim();
                if (t) inviteMut.mutate(t);
              }}
              style={{ display: "flex", gap: 10, maxWidth: 460 }}
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@empresa.com.br"
                aria-label="E-mail do convidado"
                className="via-input"
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="via-btn via-btn-primary"
                disabled={inviteMut.isPending}
              >
                <UserPlus size={14} />
                {inviteMut.isPending ? "Criando…" : "Convidar"}
              </button>
            </form>

            {(invitesQ.data?.length ?? 0) > 0 && (
              <>
                <div className="ic-section-head" style={{ marginTop: 24 }}>
                  <div className="ic-section-title">Convites pendentes</div>
                </div>
                <div className="ic-card" style={{ padding: 0 }}>
                  {invitesQ.data!.map((inv) => (
                    <div
                      key={inv.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 18px",
                        borderBottom: "1px solid var(--via-navy-15)",
                      }}
                    >
                      <Mail size={14} style={{ color: "var(--via-color-text-muted)" }} />
                      <span style={{ flex: 1, fontWeight: 600, color: "var(--via-navy)" }}>
                        {inv.email}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--via-color-text-muted)" }}>
                        criado em {new Date(inv.created_at).toLocaleDateString("pt-BR")}
                      </span>
                      <button
                        type="button"
                        className="ic-iconbtn"
                        title="Copiar link do convite"
                        aria-label={`Copiar link do convite de ${inv.email}`}
                        onClick={() => copyInvite(inv.id)}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        className="ic-iconbtn"
                        title="Remover convite"
                        aria-label={`Remover convite de ${inv.email}`}
                        onClick={() => removeInviteMut.mutate(inv.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="ic-section-head" style={{ marginTop: 24 }}>
              <div className="ic-section-title">
                Equipe ({membersQ.data?.length ?? 0})
              </div>
            </div>
            <div className="ic-card" style={{ padding: 0 }}>
              {(membersQ.data ?? []).map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 18px",
                    borderBottom: "1px solid var(--via-navy-15)",
                  }}
                >
                  <div className="ic-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                    {(m.full_name ?? m.email ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "var(--via-navy)", fontSize: 14 }}>
                      {m.full_name ?? m.email}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--via-color-text-muted)" }}>
                      {m.email}
                    </div>
                  </div>
                  <span
                    className="via-label"
                    style={{
                      fontSize: 11,
                      color: m.role === "admin" ? "var(--via-blue)" : "var(--via-color-text-muted)",
                    }}
                  >
                    {m.role === "admin" ? "Administrador" : "Membro"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
