import type { Swot } from "./types";

export const SWOT: Swot = {
  strengths: [
    {
      title: "Suporte em português 24/7",
      evidence:
        "4 de 5 concorrentes oferecem; HubSpot só em inglês business hours.",
    },
    {
      title: "Integração nativa com Pix e boleto",
      evidence:
        "Apenas Ploomes e RD têm. Pipedrive e HubSpot dependem de integração.",
    },
    {
      title: "Onboarding humano incluído",
      evidence:
        "Pipedrive e HubSpot cobram à parte; RD inclui só no plano Marketing.",
    },
  ],
  weaknesses: [
    {
      title: "Cobertura de IA nativa atrás de Pipedrive e RD",
      evidence:
        "Ambos lançaram assistente de IA nos últimos 30 dias. Você ainda usa integração externa.",
    },
    {
      title: "Catálogo de integrações 3x menor que HubSpot",
      evidence: "HubSpot: 1.500+ apps. Pipedrive: 400+. Você: 87.",
    },
    {
      title: 'Tráfego orgânico baixo em "automação de marketing"',
      evidence:
        "Top 10 concorrentes ranqueiam para 18 das 20 keywords prioritárias. Você ranqueia para 6.",
    },
  ],
  opportunities: [
    {
      title: "Vácuo em CRM para vendas complexas B2B mid-market",
      evidence:
        "Ploomes domina, mas tem só 612k visitas/mês. Mercado pouco consolidado.",
    },
    {
      title: 'Posicionamento "IA em português" ainda livre',
      evidence:
        "Concorrentes traduzem prompts; nenhum tem modelo treinado em PT-BR.",
    },
    {
      title: "Bundle CRM + WhatsApp Business API",
      evidence:
        "Apenas RD oferece. Demanda crescente em pesquisas (+47% YoY).",
    },
  ],
  threats: [
    {
      title: "RD Pro a R$ 199 entra direto no seu sweet spot",
      evidence:
        "Plano lançado hoje cobre 80% das funcionalidades do seu plano Premium (R$ 249).",
    },
    {
      title: "HubSpot pivotando agressivamente para IA",
      evidence:
        "Mudança de headline + 12 lançamentos de feature em 60 dias indicam guerra de IA.",
    },
    {
      title: "Agendor cortando preços indica pressão no PME",
      evidence:
        "Possível início de guerra de preços no segmento de entrada.",
    },
  ],
};
