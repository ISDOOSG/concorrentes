import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AuthedUser = {
  user: User;
  session: Session;
  email: string;
  fullName: string | null;
  initials: string;
  logout: () => Promise<void>;
};

export function useAuthedUser(): AuthedUser | null {
  const [session, setSession] = useState<Session | null>(null);

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

  if (!session) return null;

  const email = session.user.email ?? "";
  const fullName =
    (session.user.user_metadata?.full_name as string | undefined) ?? null;
  const initials = (fullName || email || "A").slice(0, 1).toUpperCase();

  return {
    user: session.user,
    session,
    email,
    fullName,
    initials,
    logout: async () => {
      await supabase.auth.signOut();
    },
  };
}
