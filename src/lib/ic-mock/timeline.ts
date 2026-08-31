import type { TimelineItem } from "./types";

export const TIMELINE_RD: TimelineItem[] = [
  { date: "24/04", type: "pricing", label: "Novo plano RD Pro a R$ 199", severity: "high" },
  { date: "22/04", type: "feature", label: "Lançou IA generativa em e-mail marketing", severity: "high" },
  { date: "20/04", type: "content", label: '4 artigos sobre "IA em vendas"', severity: "low" },
  { date: "18/04", type: "copy", label: 'Mudou CTA do hero: "Teste grátis" → "Agendar demo"', severity: "medium" },
  { date: "15/04", type: "design", label: "Refresh visual da página de preços", severity: "low" },
  { date: "11/04", type: "feature", label: "Removeu integração com Mautic", severity: "medium" },
  { date: "08/04", type: "pricing", label: "Aumentou plano Marketing de R$ 329 → R$ 349", severity: "medium" },
  { date: "03/04", type: "content", label: 'Publicou whitepaper "ROI de IA em vendas B2B"', severity: "low" },
];
