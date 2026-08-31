import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { data } from "../index";
import type {
  ScraperKeySource,
  ScraperProviderId,
  ScraperTestResult,
} from "../types";

const KEY = ["scraper-keys"] as const;

export function useScraperKeys() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => data.listScraperKeys(),
    // Status pode mudar entre visitas (usuário conecta/desconecta o
    // connector via Lovable em outra aba) — sempre revalida ao montar
    refetchOnMount: "always",
  });
}

export function useSaveScraperKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      provider: ScraperProviderId;
      key: string;
      source?: ScraperKeySource;
    }) => data.saveScraperKey(input.provider, input.key, input.source),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteScraperKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: ScraperProviderId) =>
      data.deleteScraperKey(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTestScraperKey() {
  return useMutation<
    ScraperTestResult,
    Error,
    { provider: ScraperProviderId; keyOverride?: string }
  >({
    mutationFn: ({ provider, keyOverride }) =>
      data.testScraperKey(provider, keyOverride),
  });
}

// Testa a chave já armazenada (manual ou via connector Lovable).
// O provider decide o caminho conforme o source detectado.
export function useTestStoredKey() {
  return useMutation<ScraperTestResult, Error, ScraperProviderId>({
    mutationFn: (provider) => data.testScraperKey(provider),
  });
}
