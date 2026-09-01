import { useEffect, useState } from "react";

import { getSession, onAuthChange, signOut, type ApiSession } from "@/lib/api-client";

export type AuthedUser = {
  email: string;
  fullName: string | null;
  initials: string;
  role: "admin" | "member";
  logout: () => Promise<void>;
};

export function useAuthedUser(): AuthedUser | null {
  const [session, setSession] = useState<ApiSession | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      getSession().then((s) => {
        if (mounted) setSession(s);
      });
    };
    load();
    const unsub = onAuthChange(load);
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  if (!session) return null;

  const email = session.user.email ?? "";
  const fullName = session.user.nome ?? null;
  const initials = (fullName || email || "A").slice(0, 1).toUpperCase();

  return {
    email,
    fullName,
    initials,
    role: session.role,
    logout: async () => {
      signOut();
    },
  };
}
