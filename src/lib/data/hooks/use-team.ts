import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { data } from "@/lib/data";
import type { TeamInvite, TeamMember } from "@/lib/data/types";

const MEMBROS = ["team-members"] as const;
const CONVITES = ["team-invites"] as const;

/**
 * Time e convites, pelo contrato.
 *
 * A tela de Equipe montava `useQuery`/`useMutation` com `apiFetch` cru, sem
 * passar pelo `DataProvider`. Era a terceira tela a fazer isso (as outras
 * duas eram SEO e Redes sociais), e o efeito aparecia no modo demonstracao:
 * o painel inteiro usava dado simulado e estas tres iam para a rede.
 */
export function useTeamMembers(habilitado = true) {
  return useQuery({
    queryKey: MEMBROS,
    queryFn: (): Promise<TeamMember[]> => data.listTeamMembers(),
    enabled: habilitado,
  });
}

export function useInvites(habilitado = true) {
  return useQuery({
    queryKey: CONVITES,
    queryFn: (): Promise<TeamInvite[]> => data.listInvites(),
    enabled: habilitado,
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => data.createInvite(email),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONVITES }),
  });
}

export function useDeleteInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => data.deleteInvite(inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONVITES }),
  });
}
