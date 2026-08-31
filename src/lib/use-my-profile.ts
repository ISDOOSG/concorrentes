import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type MyProfile = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: "admin" | "member";
};

export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: async (): Promise<MyProfile | null> => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        fullName: data.full_name,
        email: data.email,
        role: (data.role as MyProfile["role"]) ?? "member",
      };
    },
  });
}
