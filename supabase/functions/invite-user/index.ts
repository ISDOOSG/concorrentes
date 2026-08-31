// Edge function: invite-user — o administrador convida um novo usuário pela
// UI. Usa o convite NATIVO do Supabase (inviteUserByEmail): o próprio Supabase
// envia o e-mail automaticamente e o usuário nasce com invited_at, o que o
// libera do bloqueio de cadastro direto (trigger before_user_signup_invite_only).
//
// Auth: usuário autenticado com profiles.role = 'admin'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Sessão inválida" }, 401);

    const { data: me } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userRes.user.id)
      .maybeSingle();
    if (me?.role !== "admin") {
      return json({ error: "Apenas o administrador pode convidar usuários" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: "E-mail inválido" }, 400);

    // Redireciona o link do convite para a tela de aceite do app que chamou.
    const origin = req.headers.get("origin") ?? "";
    const redirectTo = origin ? `${origin}/convite` : undefined;

    // O registro em invites vem ANTES do GoTrue: a tabela é a allowlist do
    // gate before_user_signup_invite_only — sem a linha, o insert do próprio
    // convite seria bloqueado.
    const { error: upErr } = await admin
      .from("invites")
      .upsert(
        { email, invited_by: userRes.user.id, created_at: new Date().toISOString(), accepted_at: null },
        { onConflict: "email" },
      );
    if (upErr) return json({ error: upErr.message }, 500);

    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      ...(redirectTo ? { redirectTo } : {}),
    });
    if (invErr) {
      const msg = invErr.message ?? "Falha ao enviar o convite";
      if (/already|registered|exists/i.test(msg)) {
        await admin.from("invites").delete().eq("email", email);
        return json({ error: "Este e-mail já tem conta na plataforma." }, 409);
      }
      // Mantém a linha em invites: o convidado ainda pode se cadastrar
      // manualmente pelo formulário enquanto o convite estiver pendente.
      return json({ error: `Falha ao enviar o convite: ${msg}` }, 500);
    }

    return json({ ok: true, email });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
