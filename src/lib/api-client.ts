// Cliente HTTP para a API propria do Concorrentes -- substitui o
// supabase-js. Token em localStorage (mesmo lugar que o supabase usava por
// baixo dos panos via previewAuthStorage), injetado como Bearer em toda
// chamada.

const TOKEN_KEY = "cc_auth_token";
const EVENT = "cc:auth-changed";

function baseUrl(): string {
  if (typeof window !== "undefined") return "/api";
  // SSR: fala direto com o container da API, sem passar por nginx/TLS.
  return "http://127.0.0.1:8012";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(EVENT));
}

// _authed.tsx e outros assinam este evento para saber quando a sessao muda
// (login, logout, ou token expirado em outra aba).
export function onAuthChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const msg =
      (body as { detail?: string } | null)?.detail ?? `Erro ${res.status}`;
    // 401 quer dizer que o token morreu (expirou ou foi revogado) -- limpa
    // pra nao ficar tentando de novo com credencial invalida.
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

// ----- Auth -----

export type ApiUser = { id: string; email: string; nome: string };
export type ApiSession = { user: ApiUser; role: "admin" | "member" };

let cachedMe: Promise<ApiSession | null> | null = null;

function invalidateMe() {
  cachedMe = null;
}

export async function getSession(): Promise<ApiSession | null> {
  if (!getToken()) return null;
  if (!cachedMe) {
    cachedMe = apiFetch<{ usuario: ApiUser; perfil: { role: string } }>(
      "/auth/me",
    )
      .then((r) => ({
        user: r.usuario,
        role: (r.perfil?.role as "admin" | "member") ?? "member",
      }))
      .catch(() => null);
  }
  return cachedMe;
}

export async function signInWithPassword(
  email: string,
  senha: string,
): Promise<{ token: string; usuario: ApiUser }> {
  const r = await apiFetch<{ token: string; usuario: ApiUser }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, senha }) },
  );
  setToken(r.token);
  invalidateMe();
  return r;
}

export async function signUp(
  email: string,
  senha: string,
  nome?: string,
): Promise<{ token: string; usuario: ApiUser }> {
  const r = await apiFetch<{ token: string; usuario: ApiUser }>(
    "/auth/signup",
    { method: "POST", body: JSON.stringify({ email, senha, nome }) },
  );
  setToken(r.token);
  invalidateMe();
  return r;
}

export async function acceptInvite(
  inviteId: string,
  senha: string,
  nome?: string,
): Promise<{ token: string; usuario: ApiUser }> {
  const r = await apiFetch<{ token: string; usuario: ApiUser }>(
    `/convite/${inviteId}/accept`,
    { method: "POST", body: JSON.stringify({ senha, nome }) },
  );
  setToken(r.token);
  invalidateMe();
  return r;
}

export function signOut(): void {
  setToken(null);
  invalidateMe();
}
