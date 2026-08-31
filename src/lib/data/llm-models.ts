import type { LLMModelOption, LLMProviderId, LLMUseCase } from "./types";

// Catalog of selectable models per provider, per use case.
// Default models (first item of each list) are used when the user hasn't picked one.
export const LLM_MODELS: Record<LLMProviderId, LLMModelOption[]> = {
  lovable: [
    {
      id: "google/gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      description: "Equilíbrio entre custo, velocidade e qualidade. Default.",
      recommendedFor: ["classification", "swot"],
    },
    {
      id: "google/gemini-2.5-flash-lite",
      label: "Gemini 2.5 Flash Lite",
      description: "Mais rápido e barato. Ideal para classificação em massa.",
      recommendedFor: ["classification"],
    },
    {
      id: "google/gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      description: "Maior qualidade de raciocínio. Bom para SWOT detalhado.",
      recommendedFor: ["swot"],
    },
    {
      id: "openai/gpt-5-mini",
      label: "GPT-5 Mini",
      description: "Boa relação custo/qualidade da OpenAI via Lovable.",
      recommendedFor: ["classification", "swot"],
    },
    {
      id: "openai/gpt-5",
      label: "GPT-5",
      description: "Top de linha OpenAI. SWOT premium.",
      recommendedFor: ["swot"],
    },
  ],
  anthropic: [
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      description: "Rápido e barato. Ideal para classificação.",
      recommendedFor: ["classification"],
    },
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      description: "Equilíbrio. Default para SWOT.",
      recommendedFor: ["swot"],
    },
    {
      id: "claude-opus-4-1",
      label: "Claude Opus 4.1",
      description: "Máxima qualidade. Custo mais alto.",
      recommendedFor: ["swot"],
    },
  ],
  openai: [
    {
      id: "gpt-4o-mini",
      label: "GPT-4o Mini",
      description: "Rápido e barato. Default para classificação.",
      recommendedFor: ["classification"],
    },
    {
      id: "gpt-4o",
      label: "GPT-4o",
      description: "Equilíbrio. Default para SWOT.",
      recommendedFor: ["swot"],
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      description: "Raciocínio aprimorado para análises mais densas.",
      recommendedFor: ["swot"],
    },
    {
      id: "o4-mini",
      label: "o4-mini",
      description: "Modelo de raciocínio rápido.",
      recommendedFor: ["swot"],
    },
  ],
  gemini: [
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      description: "Default para classificação. Rápido e barato.",
      recommendedFor: ["classification"],
    },
    {
      id: "gemini-2.5-flash-lite",
      label: "Gemini 2.5 Flash Lite",
      description: "Ainda mais rápido. Ótimo para grandes volumes.",
      recommendedFor: ["classification"],
    },
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      description: "Default para SWOT. Raciocínio profundo.",
      recommendedFor: ["swot"],
    },
    {
      id: "gemini-3-pro-preview",
      label: "Gemini 3 Pro (preview)",
      description: "Última geração em preview. Use com cautela.",
      recommendedFor: ["swot"],
    },
  ],
};

export function getDefaultModel(
  provider: LLMProviderId,
  useCase: LLMUseCase,
): string {
  const models = LLM_MODELS[provider] ?? [];
  const recommended = models.find((m) => m.recommendedFor?.includes(useCase));
  return (recommended ?? models[0])?.id ?? "";
}

export function findModel(
  provider: LLMProviderId,
  modelId: string | null | undefined,
): LLMModelOption | null {
  if (!modelId) return null;
  return LLM_MODELS[provider]?.find((m) => m.id === modelId) ?? null;
}
