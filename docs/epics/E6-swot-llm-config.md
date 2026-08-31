# Epic 6 — SWOT por IA + Configuração de LLM Provider (BYOK)

> **MVP:** —
> **Depende de:** E3
> **Stories:** 3

## Objetivo

1. Permitir que o usuário **escolha** entre Lovable AI (default), Anthropic, OpenAI ou Google Gemini, trazendo sua própria chave (BYOK).
2. Gerar **relatórios SWOT** (Forças, Fraquezas, Oportunidades, Ameaças) a partir dos snapshots e changes acumulados de um competidor.

## Critérios de aceite (epic-level)

- [ ] Migrations `0006_user_llm_settings.sql` e `0007_user_llm_keys.sql` aplicadas (com pgcrypto)
- [ ] Edge Functions `save-llm-key`, `delete-llm-key` funcionais
- [ ] `_shared/llm-provider.ts` com router pronto (Lovable como fallback)
- [ ] Página `/settings/llm` permite ao usuário escolher provider e colar chave; UI mostra "sk-...abcd" (key_hint) sem expor chave completa
- [ ] Edge Function `generate-swot` consome agregados (últimos 30d) e produz SWOT estruturado
- [ ] `/competitors/$id` ganha tab "SWOT" com botão "Gerar SWOT" e lista histórica de relatórios
- [ ] Custo da chamada gravado em `swot_reports.cost_cents`

## Stories propostos

### E6.1 — Provider router + BYOK schema + save/delete keys
- Migrations `user_llm_settings` + `user_llm_keys` + funções `encrypt_llm_key`/`decrypt_llm_key` (SECURITY DEFINER)
- Edge Function `save-llm-key` (recebe plain key, valida com test call no provider, criptografa, salva)
- Edge Function `delete-llm-key`
- `_shared/llm-provider.ts` — `getLLMClient(userId, useCase)` resolve provider e retorna cliente unificado

### E6.2 — UI `/settings/llm`
- Seleção de provider (4 cards: Lovable, Anthropic, OpenAI, Gemini)
- Form para colar API key (somente para os 3 BYOK)
- Lista de keys salvas com `key_hint` + botão remover
- Mensagem clara: "Sem chave configurada → usaremos Lovable AI (cobrado pelo seu plano Lovable Cloud)"

### E6.3 — Edge Function `generate-swot` + UI
- Agrega últimos 30d de snapshots + changes do competitor
- Prompt estruturado pedindo JSON com 4 arrays (S/W/O/T)
- Usa modelo "swot" (Sonnet 4.6 / GPT-4o / Gemini 2.5 Pro / Lovable equivalent)
- Persiste em `swot_reports`
- UI: tab "SWOT" no detalhe do competitor, botão "Gerar SWOT" (com loading), histórico de relatórios prévios

## Dependências técnicas

- E3 concluído (snapshots + changes populados)
- E4 idealmente concluído (changes existem) — mas SWOT pode rodar só com snapshots
- pgcrypto extension habilitada
- `LLM_KEY_ENCRYPTION_SECRET` setado nos secrets

## Riscos

- **Chave inválida do usuário:** validar com test call ao salvar; em runtime, se 401/403 → fallback Lovable + warning
- **Custo SWOT alto:** Sonnet/GPT-4o em múltiplos competidores pode custar caro. Limitar 1 SWOT por competitor a cada 24h em v1
- **Vazamento de chaves:** `encrypted_key` NUNCA retorna em select; UI só vê `key_hint`

## Out of scope

- Comparar SWOT entre competitors lado-a-lado — v1.1
- SWOT do **próprio** produto do usuário (auto-análise) — v2
- Versionamento/diff de SWOTs ao longo do tempo — v1.1
