-- Migração 2026-09-02 — três decisões do dono, tomadas depois do desacoplamento.
--
-- 1. O gatilho que fazia a tela mentir ao nascer.
-- 2. As duas tabelas sociais sem chave estrangeira.
-- 3. As duas funções com EXECUTE aberto para PUBLIC.
--
-- Idempotente: roda duas vezes sem estragar.

begin;

-- ── 1. a mensagem falsa ao nascer ───────────────────────────────────────────
--
-- `on_competitor_inserted` chamava `invoke_crawl_competitor`, que — sem
-- `app_config` preenchido — marcava o concorrente recém-criado como
-- `crawl_status = 'failed'` com o texto "Configuração inicial pendente: o dono
-- da plataforma precisa chamar a function bootstrap-app-config". Essa edge
-- function não existe mais nem no repositório, e o crawl agora é feito pelo
-- serviço (POST /competitors/{id}/crawl e o cron das 03:50).
--
-- Sem o gatilho, o concorrente nasce com o default da coluna: `never`, que é
-- a verdade — ninguém crawleou ainda.
drop trigger if exists on_competitor_inserted on public.competitors;

-- A função fica: ela é `SECURITY DEFINER` e não é alcançável de fora (não há
-- PostgREST publicando RPC), e apagá-la exigiria recriar caso o gatilho volte.
-- O que precisava sumir era o disparo automático, não o código.

-- ── 2. as duas tabelas sociais sem FK ───────────────────────────────────────
--
-- `social_snapshots` e `social_analyses` referenciavam `competitors` e
-- `usuario` por uuid solto: apagar um concorrente deixava as duas linhas
-- órfãs — visto duas vezes em 02/09, ao limpar dado de teste. As outras cinco
-- tabelas do produto (snapshots, changes, ads_snapshots, seo_analyses,
-- swot_reports) já têm `ON DELETE CASCADE`.
--
-- A origem na Supabase também não tinha a FK; o DB_SCHEMA.sql marcava como
-- `TODO(revisao)` justamente para esta decisão.
delete from public.social_analyses
 where competitor_id not in (select id from public.competitors);
delete from public.social_snapshots
 where competitor_id not in (select id from public.competitors);

alter table public.social_snapshots
  drop constraint if exists social_snapshots_competitor_id_fkey,
  add  constraint social_snapshots_competitor_id_fkey
       foreign key (competitor_id) references public.competitors(id) on delete cascade;

alter table public.social_snapshots
  drop constraint if exists social_snapshots_user_id_fkey,
  add  constraint social_snapshots_user_id_fkey
       foreign key (user_id) references public.usuario(id) on delete cascade;

alter table public.social_analyses
  drop constraint if exists social_analyses_competitor_id_fkey,
  add  constraint social_analyses_competitor_id_fkey
       foreign key (competitor_id) references public.competitors(id) on delete cascade;

alter table public.social_analyses
  drop constraint if exists social_analyses_user_id_fkey,
  add  constraint social_analyses_user_id_fkey
       foreign key (user_id) references public.usuario(id) on delete cascade;

-- ── 3. o EXECUTE aberto ─────────────────────────────────────────────────────
--
-- `get_llm_key` e `get_scraper_key` vieram migradas verbatim COM a falha que a
-- auditoria de 31/08 achou: são `SECURITY DEFINER`, aceitam qualquer
-- `_user_id` vindo de fora e devolvem a chave decifrada em texto puro. Na
-- Supabase estavam publicadas por PostgREST e alcançáveis com a chave pública
-- do bundle.
--
-- Aqui não há PostgREST e o banco só escuta em 127.0.0.1 — a exposição já
-- estava resolvida por arquitetura. Isto fecha a segunda porta: nenhum papel
-- além do dono do banco pode executá-las.
--
-- O serviço NÃO as chama: `ia.py` e `coletores.py` decifram por SELECT direto,
-- com o user_id vindo do JWT.
revoke execute on function public.get_llm_key(uuid, text) from public;
revoke execute on function public.get_scraper_key(uuid, text) from public;

commit;
