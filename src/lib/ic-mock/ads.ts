import type { Ad } from "./types";

// Mock ads para os 5 seeds. Apenas Modo Demo usa esses dados.
// No modo real, ads vêm de ads_snapshots populado pela Edge Function
// fetch-competitor-ads via ScrapeCreators.

const today = new Date();
const daysAgo = (n: number) =>
  new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

export const ADS: Ad[] = [
  // --- RD Station ---
  {
    id: "ad_rd_1",
    competitor: "rdstation",
    source: "meta",
    ad_archive_id: "fb_arch_001",
    active: true,
    body_text:
      "Conheça o novo RD Pro com IA generativa nativa. Automação de funil + lead scoring no mesmo plano por R$ 199/mês.",
    cta_text: "Agendar demo",
    cta_url: "https://rdstation.com/precos",
    page_name: "RD Station",
    creatives: [{ type: "image", url: "" }],
    targeting: {
      age_min: 25,
      age_max: 55,
      genders: ["all"],
      countries: ["BR"],
    },
    spend_estimate: { lower_bound: 5000, upper_bound: 9999, currency: "BRL" },
    start_date: daysAgo(8),
    end_date: null,
    platforms: ["facebook", "instagram"],
    fetched_at: daysAgo(0),
  },
  {
    id: "ad_rd_2",
    competitor: "rdstation",
    source: "google",
    ad_archive_id: "g_001",
    active: true,
    body_text:
      "CRM brasileiro com IA. Aumente conversões em 40% com lead scoring automático.",
    cta_text: "Teste grátis 10 dias",
    cta_url: "https://rdstation.com/teste",
    page_name: "RD Station",
    creatives: [{ type: "image", url: "" }],
    targeting: { countries: ["BR"] },
    spend_estimate: { lower_bound: 2000, upper_bound: 4999, currency: "BRL" },
    start_date: daysAgo(15),
    end_date: null,
    platforms: ["search", "display"],
    fetched_at: daysAgo(0),
  },
  {
    id: "ad_rd_3",
    competitor: "rdstation",
    source: "meta",
    ad_archive_id: "fb_arch_003",
    active: true,
    body_text:
      "Como vendedores brasileiros estão usando IA pra fechar 3x mais. Whitepaper grátis.",
    cta_text: "Baixar agora",
    cta_url: "https://rdstation.com/whitepaper-ia",
    page_name: "RD Station",
    creatives: [{ type: "video", url: "" }],
    targeting: {
      age_min: 28,
      age_max: 50,
      genders: ["all"],
      countries: ["BR"],
    },
    spend_estimate: { lower_bound: 1000, upper_bound: 2999, currency: "BRL" },
    start_date: daysAgo(3),
    end_date: null,
    platforms: ["facebook", "instagram", "audience_network"],
    fetched_at: daysAgo(0),
  },

  // --- Pipedrive ---
  {
    id: "ad_pp_1",
    competitor: "pipedrive",
    source: "meta",
    ad_archive_id: "fb_arch_pp_1",
    active: true,
    body_text:
      "AI Sales Assistant: resumo automático de calls, próxima ação sugerida, e-mails gerados. Tudo no Pipedrive.",
    cta_text: "Try free",
    cta_url: "https://pipedrive.com/ai",
    page_name: "Pipedrive",
    creatives: [{ type: "video", url: "" }],
    targeting: {
      age_min: 24,
      age_max: 60,
      genders: ["all"],
      countries: ["US", "BR", "MX", "AR"],
    },
    spend_estimate: { lower_bound: 25000, upper_bound: 49999, currency: "USD" },
    start_date: daysAgo(5),
    end_date: null,
    platforms: ["facebook", "instagram"],
    fetched_at: daysAgo(0),
  },
  {
    id: "ad_pp_2",
    competitor: "pipedrive",
    source: "google",
    ad_archive_id: "g_pp_1",
    active: true,
    body_text:
      "Pipeline visual that moves deals forward. From $14/mo. Free trial.",
    cta_text: "Start free",
    cta_url: "https://pipedrive.com",
    page_name: "Pipedrive",
    creatives: [{ type: "image", url: "" }],
    targeting: { countries: ["US", "BR", "ES", "MX"] },
    spend_estimate: { lower_bound: 50000, upper_bound: 99999, currency: "USD" },
    start_date: daysAgo(45),
    end_date: null,
    platforms: ["search"],
    fetched_at: daysAgo(0),
  },

  // --- HubSpot ---
  {
    id: "ad_hs_1",
    competitor: "hubspot",
    source: "meta",
    ad_archive_id: "fb_arch_hs_1",
    active: true,
    body_text:
      "AI-Powered Customer Platform: marketing, sales, service, and CMS all connected and powered by AI.",
    cta_text: "Get HubSpot",
    cta_url: "https://hubspot.com",
    page_name: "HubSpot",
    creatives: [{ type: "video", url: "" }],
    targeting: {
      age_min: 22,
      age_max: 65,
      genders: ["all"],
      countries: ["US", "GB", "BR", "DE", "ES"],
    },
    spend_estimate: {
      lower_bound: 100000,
      upper_bound: 499999,
      currency: "USD",
    },
    start_date: daysAgo(1),
    end_date: null,
    platforms: ["facebook", "instagram", "audience_network"],
    fetched_at: daysAgo(0),
  },
  {
    id: "ad_hs_2",
    competitor: "hubspot",
    source: "google",
    ad_archive_id: "g_hs_1",
    active: true,
    body_text:
      "Customer Platform with AI. Free CRM forever. Trusted by 200,000+ companies.",
    cta_text: "Get free CRM",
    cta_url: "https://hubspot.com/products/crm",
    page_name: "HubSpot",
    creatives: [{ type: "image", url: "" }],
    targeting: { countries: ["US", "BR"] },
    spend_estimate: {
      lower_bound: 200000,
      upper_bound: 499999,
      currency: "USD",
    },
    start_date: daysAgo(60),
    end_date: null,
    platforms: ["search", "display", "youtube"],
    fetched_at: daysAgo(0),
  },

  // --- Ploomes ---
  {
    id: "ad_pl_1",
    competitor: "ploomes",
    source: "meta",
    ad_archive_id: "fb_arch_pl_1",
    active: true,
    body_text:
      "CRM brasileiro pra vendas complexas B2B. Propostas com assinatura digital nativa, agora sem D4Sign. R$ 49–229/mês.",
    cta_text: "Quero conhecer",
    cta_url: "https://ploomes.com/propostas",
    page_name: "Ploomes",
    creatives: [{ type: "image", url: "" }],
    targeting: {
      age_min: 28,
      age_max: 55,
      genders: ["male", "female"],
      countries: ["BR"],
    },
    spend_estimate: { lower_bound: 500, upper_bound: 1999, currency: "BRL" },
    start_date: daysAgo(4),
    end_date: null,
    platforms: ["facebook", "instagram"],
    fetched_at: daysAgo(0),
  },

  // --- Agendor ---
  {
    id: "ad_ag_1",
    competitor: "agendor",
    source: "meta",
    ad_archive_id: "fb_arch_ag_1",
    active: true,
    body_text:
      "CRM gratuito para PMEs. Ative agora — Pro a R$ 129/mês (era R$ 149).",
    cta_text: "Começar grátis",
    cta_url: "https://agendor.com.br",
    page_name: "Agendor",
    creatives: [{ type: "image", url: "" }],
    targeting: {
      age_min: 25,
      age_max: 55,
      genders: ["all"],
      countries: ["BR"],
    },
    spend_estimate: { lower_bound: 200, upper_bound: 999, currency: "BRL" },
    start_date: daysAgo(3),
    end_date: null,
    platforms: ["facebook", "instagram"],
    fetched_at: daysAgo(0),
  },
];
