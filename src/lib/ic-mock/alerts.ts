import type { Alert } from "./types";

export const ALERTS: Alert[] = [
  {
    id: "a1",
    competitor: "rdstation",
    severity: "high",
    type: "pricing",
    title: 'RD Station lançou novo plano "RD Pro" a R$ 199/mês',
    detail:
      "IA generativa nativa + 3.000 leads incluídos. Posicionado entre Light (R$ 79) e Marketing (R$ 349).",
    time: "Há 2 horas",
    source: "/precos",
    confidence: 96,
  },
  {
    id: "a2",
    competitor: "pipedrive",
    severity: "high",
    type: "feature",
    title: 'Pipedrive ativou "AI Sales Assistant" no Professional',
    detail:
      "Resumo automático de calls, sugestão de próxima ação e geração de e-mail. Sem custo adicional.",
    time: "Há 5 horas",
    source: "/features/ai",
    confidence: 94,
  },
  {
    id: "a3",
    competitor: "ploomes",
    severity: "medium",
    type: "feature",
    title: "Ploomes adicionou Propostas com assinatura digital nativa",
    detail:
      "Antes era integração com D4Sign. Agora nativo, sem custo extra. Pode pressionar competidores no segmento de vendas complexas.",
    time: "Há 4 horas",
    source: "/propostas",
    confidence: 91,
  },
  {
    id: "a4",
    competitor: "hubspot",
    severity: "medium",
    type: "copy",
    title: "HubSpot mudou headline da home",
    detail:
      '"Customer Platform" virou "AI-Powered Customer Platform". Sinaliza reposicionamento agressivo em IA.',
    time: "Há 1 dia",
    source: "/",
    confidence: 88,
  },
  {
    id: "a5",
    competitor: "agendor",
    severity: "low",
    type: "pricing",
    title: "Agendor reduziu plano Pro em ~13%",
    detail:
      "De R$ 149 para R$ 129/mês. Possível resposta a entrada de concorrentes low-cost no segmento PME.",
    time: "Há 3 dias",
    source: "/precos",
    confidence: 99,
  },
  {
    id: "a6",
    competitor: "rdstation",
    severity: "low",
    type: "content",
    title: 'RD publicou 4 novos artigos sobre "IA em vendas"',
    detail:
      "Padrão de conteúdo sugere preparação de campanha de mídia paga em torno de IA generativa.",
    time: "Há 2 dias",
    source: "/blog",
    confidence: 82,
  },
];
