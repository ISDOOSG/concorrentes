import { useQuery } from "@tanstack/react-query";

import { apiFetch, getSession } from "@/lib/api-client";

export type MyProfile = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: "admin" | "member";
  /** Plano do perfil no banco. Null quando `/auth/me` nao respondeu. */
  plan: string | null;
  /** Teto de concorrentes que a API aplica de verdade em POST /competitors. */
  urlQuota: number | null;
};

type RespostaMe = {
  usuario: { id: string; email: string; nome: string | null };
  perfil: {
    plan: string | null;
    url_quota: number | null;
    role: "admin" | "member";
    full_name: string | null;
  } | null;
};

export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: async (): Promise<MyProfile | null> => {
      const session = await getSession();
      if (!session) return null;
      // A sessao (localStorage) nao carrega plano nem cota -- so `/auth/me`
      // sabe. Se a chamada falhar, cai na sessao em vez de derrubar a tela:
      // o layout inteiro depende deste hook.
      try {
        const me = await apiFetch<RespostaMe>("/auth/me");
        return {
          id: me.usuario.id,
          fullName: me.perfil?.full_name ?? me.usuario.nome,
          email: me.usuario.email,
          role: me.perfil?.role ?? session.role,
          plan: me.perfil?.plan ?? null,
          urlQuota: me.perfil?.url_quota ?? null,
        };
      } catch {
        return {
          id: session.user.id,
          fullName: session.user.nome,
          email: session.user.email,
          role: session.role,
          plan: null,
          urlQuota: null,
        };
      }
    },
  });
}

/** "free" -> "Plano Free". Sem plano conhecido, nao inventa rotulo. */
export function rotuloDoPlano(plan: string | null | undefined): string | null {
  if (!plan) return null;
  return "Plano " + plan.charAt(0).toUpperCase() + plan.slice(1);
}
