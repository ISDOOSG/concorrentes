import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { data } from "../index";
import type { LLMProviderId, LLMUseCase } from "../types";

const KEY = ["llm-settings"] as const;

export function useLlmSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => data.getLlmSettings(),
  });
}

export function useSetLlmProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: LLMProviderId) => data.setLlmProvider(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetLlmModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { useCase: LLMUseCase; modelId: string | null }) =>
      data.setLlmModel(input.useCase, input.modelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSaveLlmKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: LLMProviderId; key: string }) =>
      data.saveLlmKey(input.provider, input.key),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteLlmKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: LLMProviderId) => data.deleteLlmKey(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

