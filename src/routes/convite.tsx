import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { acceptInvite, apiFetch, ApiError } from "@/lib/api-client";

const conviteSearchSchema = z.object({
  id: z.string().optional(),
});

export const Route = createFileRoute("/convite")({
  validateSearch: conviteSearchSchema,
  component: AcceptInvite,
});

type ConviteState =
  | { status: "loading" }
  | { status: "invalido" }
  | { status: "valido"; email: string };

// O link do convite chega como /convite?id=<uuid> -- o id da linha de
// convites e o proprio token de acesso (nao existe magic link por e-mail
// ainda, sem infra de envio; o admin compartilha o link manualmente,
// ver settings.equipe.tsx).
function AcceptInvite() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const [state, setState] = useState<ConviteState>({ status: "loading" });
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setState({ status: "invalido" });
      return;
    }
    let mounted = true;
    apiFetch<{ email: string }>(`/convite/${id}`)
      .then((r) => {
        if (mounted) setState({ status: "valido", email: r.email });
      })
      .catch(() => {
        if (mounted) setState({ status: "invalido" });
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.status !== "valido" || !id) return;
    if (password.length < 8) {
      setError("A senha precisa de pelo menos 8 caracteres.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await acceptInvite(id, password, fullName.trim() || undefined);
    } catch (e2) {
      setSaving(false);
      setError(e2 instanceof ApiError ? e2.message : "Falha ao aceitar o convite.");
      return;
    }
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

        {state.status === "loading" ? (
          <p className="via-body">Validando seu convite…</p>
        ) : state.status === "invalido" ? (
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
              Você foi convidado como <strong>{state.email}</strong>.
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
