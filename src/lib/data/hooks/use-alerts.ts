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
