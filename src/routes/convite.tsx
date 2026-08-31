import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/convite")({
  component: AcceptInvite,
});

// O link do e-mail de convite chega com os tokens no hash da URL; o
// supabase-js (detectSessionInUrl) cria a sessão sozinho. Aqui a pessoa só
// completa o cadastro: nome + senha.
function AcceptInvite() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (session === "loading" || !session) return;
    if (password.length < 8) {
      setError("A senha precisa de pelo menos 8 caracteres.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error: updErr } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName.trim() || null },
    });
    if (updErr) {
      setSaving(false);
      setError(updErr.message);
      return;
    }

    if (fullName.trim()) {
      await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("id", session.user.id);
    }
    await supabase.rpc("accept_invite");

    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--via-color-bg-page)",
        padding: "var(--via-space-8)",
      }}
    >
      <div
        className="ic-card"
        style={{ maxWidth: 420, width: "100%", padding: 32 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "var(--via-blue)",
              color: "var(--via-white)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            AC
          </span>
          <span className="via-label" style={{ fontSize: 12 }}>
            Análise de Concorrentes
          </span>
        </div>

        {session === "loading" ? (
          <p className="via-body">Validando seu convite…</p>
        ) : !session ? (
          <>
            <h1 className="via-h1" style={{ fontSize: 22, marginBottom: 8 }}>
              Convite inválido ou expirado
            </h1>
            <p className="via-body" style={{ color: "var(--via-color-text-muted)" }}>
              Este link de convite não é mais válido. Peça um novo convite ao
              administrador da plataforma.
            </p>
          </>
        ) : (
          <>
            <h1 className="via-h1" style={{ fontSize: 22, marginBottom: 4 }}>
              Bem-vindo!
            </h1>
            <p
              className="via-body"
              style={{ color: "var(--via-color-text-muted)", marginBottom: 20 }}
            >
              Você foi convidado como <strong>{session.user.email}</strong>.
              Defina seu nome e uma senha para entrar.
            </p>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="text"
                className="via-input"
                placeholder="Seu nome"
                aria-label="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <input
                type="password"
                className="via-input"
                placeholder="Senha (mín. 8 caracteres)"
                aria-label="Senha"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <div style={{ color: "var(--via-danger)", fontSize: 13 }}>{error}</div>
              )}
              <button
                type="submit"
                className="via-btn via-btn-primary via-btn-lg"
                disabled={saving}
              >
                {saving ? "Entrando…" : "Criar senha e entrar"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
