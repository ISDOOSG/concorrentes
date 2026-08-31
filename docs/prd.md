# PRD — Análise de Concorrentes

> **Status:** Aprovado v1.0 — 2026-04-26
> **Versão:** 1.0
> **Autor:** Henrique Gabriel

## 1. Visão Geral

A solução é uma plataforma de inteligência de mercado que permite a empresas monitorar de forma automatizada seus concorrentes. O foco não é apenas coletar dados, mas transformar mudanças técnicas e de marketing (alterações em sites, tráfego, posicionamento) em insights acionáveis via IA.

## 2. Personas

- **Gerentes de Produto:** Para acompanhar lançamentos de funcionalidades e mudanças de preços.
- **Analistas de Marketing/SEO:** Para monitorar o ranking e estratégias de conteúdo da concorrência.
- **Fundadores/CEOs:** Para ter uma visão macro do market share e movimentos estratégicos do nicho.

## 3. Jornada do Usuário

1. O usuário cadastra as URLs dos seus concorrentes.
2. O sistema realiza um "crawl" inicial usando Firecrawl e ScrapFly para mapear a estrutura atual.
3. A IA processa esses dados para gerar o primeiro relatório de posicionamento.
4. Diariamente, o sistema verifica mudanças, tira novos screenshots e atualiza o tráfego via API da Similarweb.
5. O usuário recebe alertas apenas quando uma mudança significativa (ex: queda de preço ou nova feature) é detectada.

## 4. Requisitos Funcionais

- **Módulo de Scraping:** Extração de texto limpo e estruturado de sites.
- **Módulo de Visão:** Captura de tela para registro histórico e análise de UX.
- **Motor de IA:** LLM para analisar grandes volumes de dados de tráfego e texto.
- **Sistema de Notificação:** Alertas baseados em gatilhos de mudanças detectadas.

## 5. Requisitos Não-Funcionais

- **Latência:** Análise de IA deve ser processada em background (Edge Functions) para não travar a interface.
- **Escalabilidade:** Capaz de monitorar até 50 URLs por usuário no plano básico.
- **Privacidade:** Dados de monitoramento são isolados por conta de usuário.

## 6. Critérios de Sucesso

- Redução de 80% no tempo gasto manualmente visitando sites de concorrentes.
- Precisão de 90%+ na identificação de mudanças de preço/copy via IA.

## 7. Funcionalidades Must Have

- **Dashboard de Comparação:** Visualização lado a lado de métricas de tráfego, SEO e presença digital.
- **Leitor Automático de Landing Pages:** Extração de propostas de valor, preços e funcionalidades diretamente dos sites concorrentes.
- **Monitoramento de Mudanças:** Alertas automáticos via sistema quando um concorrente altera preços ou mensagens principais.
- **Análise SWOT Gerada por IA:** Relatórios automatizados identificando Forças, Fraquezas, Oportunidades e Ameaças baseados nos dados coletados.
- **Histórico de Screenshots:** Arquivo visual das alterações de design e copy das páginas dos concorrentes ao longo do tempo.

## 8. Autenticação & Modelo de Tenancy

**Decisão:** Single-tenant por usuário.

- Cada usuário possui sua própria conta com seus dados completamente isolados.
- **Sem** workspaces, teams, organizações ou compartilhamento entre contas.
- **Não há** roles, convites ou hierarquia de permissões — o owner da conta é o único acessor.
- Isolamento implementado via **Row Level Security (RLS)** no Supabase com filtro `auth.uid() = user_id` em todas as tabelas de domínio.
- Auth via Supabase Auth (e-mail + senha como baseline; OAuth em fase posterior se necessário).

**Implicações técnicas:**
- Toda tabela de domínio (`competitors`, `snapshots`, `changes`, `screenshots`, `alerts`, `swot_reports`) carrega coluna `user_id uuid not null references auth.users(id)`.
- Edge Functions executam com JWT do usuário; queries respeitam RLS automaticamente.
- Storage buckets com policies por `auth.uid()` no path (ex: `screenshots/{user_id}/{competitor_id}/...`).

## 9. Stack Técnica (referência inicial — Lovable scaffold)

- **Frontend:** TanStack Start + React 19 + Tailwind v4 + shadcn/ui
- **Backend / DB:** Supabase (Postgres + Auth + Edge Functions + Storage)
- **Deploy:** Cloudflare Workers (via `@cloudflare/vite-plugin`)
- **Integrações externas:**
  - **Firecrawl** — scraping estruturado
  - **ScrapFly** — scraping resiliente / fallback anti-bot
  - **Similarweb API** — métricas de tráfego
  - **LLM** — análise de copy/preço/SWOT (provider a definir: OpenAI, Anthropic ou Vercel AI Gateway)
