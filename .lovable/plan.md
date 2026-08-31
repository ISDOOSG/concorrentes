## Análise pública das redes sociais (começando por Instagram)

Adicionar uma camada de **inteligência de redes sociais** no concorrente: capturar o handle do Instagram (manual ou descoberto pelo crawl), buscar perfil + posts públicos via ScrapeCreators e gerar análise com IA (frequência de postagem, formatos, temas, engajamento médio).

> Escopo: começo só com **Instagram** (mais demandado, API mais estável). LinkedIn/TikTok ficam pra próxima fase com a mesma arquitetura.

---

## Plano

### 1. Schema — armazenar handle e snapshots do perfil

**Migration nova:**
- `competitors.instagram_handle text` — handle limpo (sem `@`, sem URL), nullable
- `competitors.instagram_handle_suggestion text` — sugerido pelo crawl (igual ao padrão `facebook_page_suggestion`)
- `competitors.last_instagram_fetched_at timestamptz`
- Tabela nova **`social_snapshots`**:
  - `id`, `user_id`, `competitor_id`, `platform` ('instagram' por enquanto)
  - `handle`, `fetched_at`, `fetched_date date`
  - `followers`, `following`, `posts_count`, `is_verified`, `is_business`
  - `bio text`, `external_url`, `category`, `profile_pic_url`
  - `recent_posts jsonb` — array normalizado: `{shortcode, type, caption, taken_at, like_count, comment_count, video_view_count, thumbnail_url, permalink}`
  - `raw jsonb` — payload bruto pra debug
  - `cost_credits int default 1`
  - RLS: select/insert/update/delete pelo dono (`user_id = auth.uid()`)
  - UNIQUE `(competitor_id, platform, fetched_date)` pra idempotência diária

### 2. Edge function `fetch-competitor-social`

Espelha o padrão do `fetch-competitor-ads`:
- Body: `{ competitor_id, user_id?, platform: 'instagram', with_posts? }`
- Resolve handle nessa ordem:
  1. `competitors.instagram_handle` (manual)
  2. `competitors.instagram_handle_suggestion` (do crawl)
  3. **Fallback Firecrawl**: faz `firecrawl scrape` no `competitors.url` com `formats: ['links']`, regex `instagram\.com/([\w.\-]+)` filtrando blocklist (`p`, `reel`, `explore`, `accounts`, `stories`); pega o mais frequente. Persiste como `instagram_handle_suggestion`.
- Chama `GET https://api.scrapecreators.com/v1/instagram/profile?handle={h}&trim=true` (1 cr.)
- Normaliza: bio, contadores, top 12 posts (já vem em `edge_owner_to_timeline_media.edges`)
- Upsert em `social_snapshots` (onConflict `competitor_id,platform,fetched_date`)
- Atualiza `competitors.last_instagram_fetched_at`
- Retorna contadores + delta de followers vs último snapshot

Logs: `[fetch-social] instagram handle=X → 12 posts, 45.2k followers (Δ +312)`

### 3. Edge function `analyze-social-ig`

Roda análise IA sobre o snapshot mais recente:
- Input: últimos N (até 30 dias) `social_snapshots` desse competitor + plataforma
- Prompt pra `google/gemini-2.5-flash` via Lovable AI Gateway:
  - Cadência de postagem (média/semana, dia da semana mais ativo)
  - Mix de formatos (Reels vs Foto vs Carrossel) com %
  - Temas dominantes (clusters de hashtags + palavras-chave da caption)
  - Engajamento médio (likes/comments por post, taxa de engajamento sobre followers)
  - Top 3 posts com maior engajamento (com link)
  - 3 insights acionáveis vs nossa marca
- Persiste numa tabela `social_analyses` (mesmo padrão de `seo_analyses`): `summary`, `cadence jsonb`, `format_mix jsonb`, `themes jsonb`, `engagement jsonb`, `top_posts jsonb`, `insights jsonb`, `model`, `cost_cents`

Migration adicional cria `social_analyses` com mesma RLS de `seo_analyses`.

### 4. Server functions + hooks

**`src/server/social.functions.ts`** (novo):
- `triggerFetchSocial(competitorId, { platform, withPosts? })` → invoca edge `fetch-competitor-social`
- `listSocialSnapshots(competitorId, platform)` → últimos 30 dias
- `triggerAnalyzeSocial(competitorId, platform)` → invoca edge `analyze-social-ig`
- `getSocialAnalysis(competitorId, platform)` → último report
- `setInstagramHandle(competitorId, handle)` → update RLS-safe

**`src/lib/data/hooks/use-social.ts`** (novo): `useSocialSnapshots`, `useFetchSocial`, `useSocialAnalysis`, `useAnalyzeSocial`, `useSetInstagramHandle`.

**Mock provider**: stub retornando 1-2 snapshots fake do Viver de IA pra modo demo.

### 5. UI — nova aba "Redes Sociais" no detalhe do concorrente

**`src/components/ic/competitor-detail.tsx`**: adicionar tab `social` entre "Anúncios" e "Timeline".

**`src/components/ic/social-tab.tsx`** (novo):
- Sub-abas por plataforma (só "Instagram" ativo agora; "LinkedIn" / "TikTok" greyed-out com `Em breve`)
- Header: avatar + handle (com link clicável `instagram.com/{handle}`), botões "Buscar perfil (1 cr.)" e "Analisar com IA"
- Banner de campo vazio quando não tem handle: input inline pra colar `@handle` ou URL + botão "Salvar" + "Detectar pelo site (Firecrawl)"
- Cards de métricas: followers (+ delta vs último snapshot), posts, engajamento médio, frequência semanal
- Grid dos últimos posts (thumbnail + caption truncada + likes/comments + tipo Reel/Photo/Carousel)
- Card "Análise IA" com cadência, mix de formatos (mini gráfico), temas (tags), top posts e insights — fluxo idêntico ao `seo-ai-analysis.tsx`

**`src/components/ic/link-ads-dialog.tsx`**: adicionar 3º campo "Instagram (@ ou URL)" opcional, com extrator (`extractInstagramHandle` aceita `@nome`, URL `instagram.com/nome`, ou `nome` puro; rejeita `/p/`, `/reel/`, `/explore/`). Salvar via `setInstagramHandle` no submit.

### 6. Crawl integrar handle automaticamente
**`supabase/functions/suggest-ads-links/index.ts`**: já extrai `igFromSite[]`. Persistir o primeiro candidato como `competitors.instagram_handle_suggestion` no mesmo update final (4 linhas a mais). Sem custo extra.

### 7. Custo / safeguards
- `fetch-competitor-social` reutiliza chave ScrapeCreators existente (já cadastrada em `user_scraper_keys`)
- 1 crédito por chamada (perfil + 12 posts vêm na mesma resposta)
- Botão na UI mostra custo: **"Buscar perfil (1 cr.)"**
- Throttle: bloqueia nova busca se a última foi < 1h (mostra "Use o snapshot de Xh atrás ou aguarde")
- IA usa `google/gemini-2.5-flash` (rápido + barato), com fallback se `LOVABLE_API_KEY` indisponível

---

## Arquivos afetados

**Novos:**
- `supabase/migrations/<ts>_social_snapshots_and_handle.sql`
- `supabase/functions/fetch-competitor-social/index.ts`
- `supabase/functions/analyze-social-ig/index.ts`
- `src/server/social.functions.ts`
- `src/lib/data/hooks/use-social.ts`
- `src/components/ic/social-tab.tsx`

**Editados:**
- `src/components/ic/competitor-detail.tsx` (adiciona tab "Redes Sociais")
- `src/components/ic/link-ads-dialog.tsx` (campo Instagram)
- `src/lib/data/providers/supabase.ts` + `mock.ts` + `types.ts` + `index.ts` (expor APIs sociais)
- `supabase/functions/suggest-ads-links/index.ts` (persistir `instagram_handle_suggestion`)
- `src/lib/data/hooks/use-ads.ts` ou novo hook (`useLinkCompetitorAds` aceita `instagramHandle?`)

Sem nova chave API. Sem nova dependência npm. Sem mudança em RLS já existente — só novas policies nas tabelas novas.

Confirma que posso aplicar?