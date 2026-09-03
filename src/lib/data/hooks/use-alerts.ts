import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { data } from "../index";

const KEY = ["alerts"] as const;

export function useAlerts() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => data.listAlerts(),
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.markAlertRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Quantos alertas ainda nao foram lidos.
 *
 * A barra lateral e o sino do topo mostravam o TOTAL de alertas, que so
 * cresce: nada no produto marcava um alerta como lido, entao o numero nunca
 * baixava e o ponto vermelho ficava aceso para sempre.
 */
export function useUnreadAlertsCount(): number {
  const q = useAlerts();
  return q.data?.filter((a) => !a.read).length ?? 0;
}
