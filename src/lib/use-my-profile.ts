import { useQuery } from "@tanstack/react-query";

import { getSession } from "@/lib/api-client";

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
      const session = await getSession();
      if (!session) return null;
      return {
        id: session.user.id,
        fullName: session.user.nome,
        email: session.user.email,
        role: session.role,
      };
    },
  });
}
