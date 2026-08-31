import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/ic/app-topbar";
import { UserMenu } from "@/components/ic/user-menu";
import { SettingsSubnav } from "@/components/ic/settings-subnav";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useMyProfile } from "@/lib/use-my-profile";
import { useAlerts } from "@/lib/data/hooks/use-alerts";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/data/providers/supabase";

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

function TeamPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const profileQ = useMyProfile();
  const [email, setEmail] = useState("");

  const membersQ = useQuery({
    queryKey: ["team-members"],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
    enabled: profileQ.data?.role === "admin",
  });

  const invitesQ = useQuery({
    queryKey: ["team-invites"],
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, created_at, accepted_at")
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
    enabled: profileQ.data?.role === "admin",
  });

  const inviteMut = useMutation({
    mutationFn: async (target: string) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: target },
      });
      if (error) {
        throw new Error(
          await edgeErrorMessage(error, "Falha ao enviar o convite"),
        );
      }
      return data as { ok: true; email: string };
    },
    onSuccess: (d) => {
      toast.success(`Convite enviado para ${d.email}. O e-mail chega em instantes.`);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["team-invites"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeInviteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-invites"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const isAdmin = profileQ.data?.role === "admin";

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
                  convite. Ao convidar, o Supabase envia automaticamente um
                  e-mail com o link de acesso — a pessoa define a senha e já cai
                  na plataforma.
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
                {inviteMut.isPending ? "Enviando…" : "Convidar"}
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
                        enviado em {new Date(inv.created_at).toLocaleDateString("pt-BR")}
                      </span>
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
