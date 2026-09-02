import type { LLMModelOption, LLMProviderId, LLMUseCase } from "./types";

// Catálogo de modelos escolhíveis, por provedor e por uso.
// O primeiro recomendado da lista é o default quando o usuário não escolheu.
//
// 🚨 SÓ O GEMINI EXISTE, E OS MODELOS SÃO MEDIDOS, não copiados do catálogo.
//
// Esta tela oferecia quatro provedores — `lovable`, `anthropic`, `openai` e
// `gemini` — e o serviço implementa um. Escolher Anthropic ou OpenAI fazia
// SWOT, SEO e Social passarem a responder 501, e o `lovable` era o gateway
// que morreu junto com o laboratório.
//
// Pior: a lista antiga era de `gemini-2.5-*`. Em 2026-09-02, contra a chave
// do projeto, os três responderam "no longer available to new users" — só
// funcionavam pelo acesso legado do gateway da Lovable. Escolher um deles
// gravava um modelo morto em `user_llm_settings.model_swot`, que sobrescreve
// o default que funciona: a tela desligava a IA em silêncio.
//
// Os dois abaixo foram exercitados contra a API do Google e responderam. A
// tabela da medição está em docs/07_API_Propria.md.
//
// O tipo continua sendo `Partial`: `user_llm_settings` de quem veio do
// laboratório ainda tem `provider = 'lovable'` gravado, e o `ia.py` trata
// isso caindo no Gemini do projeto em vez de falhar. Aqui, um provedor sem
// modelos simplesmente não oferece nenhum.
export const LLM_MODELS: Partial<Record<LLMProviderId, LLMModelOption[]>> = {
  gemini: [
    {
      id: "gemini-3.5-flash",
      label: "Gemini 3.5 Flash",
      description: "Equilíbrio entre custo e qualidade. Default para análise.",
      recommendedFor: ["classification", "swot"],
    },
    {
      id: "gemini-flash-lite-latest",
      label: "Gemini Flash Lite",
      description:
        "Mais rápido e com fila menor. É para onde o serviço cai sozinho quando o modelo de análise vem congestionado.",
      recommendedFor: ["classification"],
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
