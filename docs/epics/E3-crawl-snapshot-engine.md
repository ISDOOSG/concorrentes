# Epic 3 — Crawl & Snapshot Engine

> **MVP:** ✅ Sim
> **Depende de:** E2
> **Stories:** 4

## Objetivo

Construir o coração do produto: a Edge Function que crawleia uma URL, extrai conteúdo via Firecrawl (com fallback ScrapFly), captura screenshot, busca tráfego Similarweb e persiste tudo como `snapshot` versionado.

## Critérios de aceite (epic-level)

- [ ] Migration `0003_snapshots.sql` com tabela + storage bucket + RLS + storage policies
- [ ] Edge Function `crawl-competitor` totalmente funcional (não-stub)
- [ ] Screenshot armazenado em `screenshots/{user_id}/{competitor_id}/{snapshot_id}.png`
- [ ] Snapshot insere texto extraído estruturado (preços, headlines, CTAs em `structured_data` jsonb)
- [ ] Tráfego Similarweb cacheado por 30 dias por domínio
- [ ] UI da `/competitors/$id` exibe lista de snapshots ordenada por data desc

## Stories propostos

### E3.1 — Migration snapshots + storage bucket + secrets
- DDL `snapshots` + indexes
- Criar bucket `screenshots` privado + storage policies
- Habilitar `pgcrypto` extension
- Setar Edge Function secrets: `FIRECRAWL_API_KEY`, `SCRAPFLY_API_KEY`, `SIMILARWEB_API_KEY`

### E3.2 — Edge Function `crawl-competitor` — scraping
- Tenta Firecrawl primeiro (timeout 30s)
- Fallback automático ScrapFly em caso de erro/bloqueio
- Extrai `raw_text` + `structured_data` (regex/heuristics simples para preço $/R$/€, primeira `<h1>`, primeiros `<button>`/`<a class*="cta">`)
- Calcula `content_hash` (SHA-256 do `raw_text` normalizado)
- Persiste snapshot

### E3.3 — Screenshot via Firecrawl + Similarweb traffic
- Firecrawl tem opção de screenshot — usar
- Upload do PNG para bucket `screenshots`
- Atualiza `snapshot.screenshot_path`
- Chama Similarweb API com cache: se houve fetch < 30 dias atrás para o domínio, reusar
- Persiste em `snapshot.traffic_data`

### E3.4 — UI lista de snapshots no detalhe do competitor
- Tab "Snapshots" em `/competitors/$id` lista snapshots
- Cada linha: data, source (firecrawl/scrapfly), preview do texto, link para screenshot, custo
- Botão "Crawlear agora" dispara Edge Function de verdade (substituindo stub de E2.3)

## Dependências técnicas

- E2 concluído (`competitors` table existe)
- API keys ativas: Firecrawl, ScrapFly, Similarweb
- Lovable AI key OU Anthropic key — **NÃO** necessário em E3 (LLM é E4/E6)

## Riscos

- **Firecrawl down ou rate-limited:** fallback ScrapFly é obrigatório no v1
- **Similarweb 401:** muitas APIs Similarweb são pagas; verificar se key do usuário tem acesso ao endpoint usado
- **Tamanho do raw_text:** páginas grandes podem inflar DB; truncar em ~500KB

## Out of scope

- Crawl de múltiplas páginas do mesmo domínio (deep crawl) — v1.1
- Detectar mudanças (diff) — vai em E4
- Classificar mudanças via LLM — vai em E4
