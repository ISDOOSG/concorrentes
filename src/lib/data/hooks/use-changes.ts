import { useQuery } from "@tanstack/react-query";

import { data } from "@/lib/data";
import type { CompetitorChange } from "@/lib/data/types";

const KEY = (id: string, limit: number) => ["changes", id, limit] as const;

/**
 * As mudancas detectadas entre crawls consecutivos de um concorrente.
 *
 * Fecha o circuito que ficou aberto desde o inicio do produto: a tabela
 * `changes` era escrita a cada crawl e nao existia rota, contrato nem hook
 * que a lesse. A aba Timeline mostrava vitrine ou vazio, sempre.
 */
export function useChanges(competitorId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: competitorId ? KEY(competitorId, limit) : ["changes", "noop"],
    queryFn: (): Promise<CompetitorChange[]> =>
      data.listChanges(competitorId as string, limit),
    enabled: Boolean(competitorId),
  });
}
