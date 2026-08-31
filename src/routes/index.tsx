import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--via-color-bg-page)",
        padding: "var(--via-space-8)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--via-space-3)",
          marginBottom: "var(--via-space-8)",
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "var(--via-blue)",
            color: "var(--via-white)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 16,
            letterSpacing: "0.06em",
          }}
        >
          AC
        </span>
        <span className="via-label" style={{ fontSize: 12 }}>
          Análise de Concorrentes · Viver de IA
        </span>
      </div>

      <h1 className="via-display" style={{ maxWidth: 720, marginBottom: 16 }}>
        Inteligência competitiva sem ficar refém do navegador.
      </h1>

      <p
        className="via-body"
        style={{
          maxWidth: 560,
          marginBottom: "var(--via-space-10)",
          color: "var(--via-color-text-muted)",
        }}
      >
        Monitore preços, copy, lançamentos e tráfego dos seus concorrentes em
        tempo real. Receba só o que importa, com insights gerados por IA.
      </p>

      <div style={{ display: "flex", gap: "var(--via-space-3)" }}>
        <Link to="/signup" className="via-btn via-btn-primary via-btn-lg">
          Criar conta grátis
        </Link>
        <Link to="/login" className="via-btn via-btn-secondary via-btn-lg">
          Entrar
        </Link>
      </div>
    </div>
  );
}
