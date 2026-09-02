-- Migração 2026-09-02b — os dois gatilhos inertes que sobraram.
--
-- `on_competitor_inserted` já caiu na migração anterior, porque fazia a tela
-- mentir. Estes dois nunca chegaram a fazer nada: chamam edge functions por
-- `net.http_post`, e o `pg_net` NÃO EXISTE neste banco -- só há `pgcrypto` e
-- `plpgsql`. Param antes disso, na guarda do `app_config` vazio.
--
-- Por que derrubar em vez de deixar quieto: o serviço faz o trabalho dos dois
-- desde 02/09, e o `app_config` saiu do desenho. Enquanto o gatilho existir,
-- alguém preenchendo `app_config` por engano o reativa contra um destino que
-- não existe mais -- e aí ele volta a marcar estado errado no banco, como o
-- `on_competitor_inserted` fazia.
--
--   on_snapshot_inserted     -> invoke_detect_changes
--       O diff agora é parte do próprio crawl (POST /competitors/{id}/crawl),
--       determinístico, e é ele que grava em `changes`.
--
--   on_snapshot_suggest_ads  -> invoke_suggest_ads_links
--       Virou rota explícita (POST /competitors/{id}/ads-suggestion). Deixou
--       de ser efeito colateral de inserir snapshot, e passou a custar
--       crédito só quando alguém pede -- 2 do ScrapeCreators por chamada.
--
-- 🚨 O QUE FICA: `on_change_inserted` -> `invoke_generate_alerts`. Esse
-- FUNCIONA e é usado: roda inteiro dentro do banco, sem `pg_net`, e é ele que
-- cria o alerta quando uma mudança é gravada. Derrubá-lo apagaria os alertas.
--
-- As funções ficam. Não são alcançáveis de fora (não há PostgREST) e apagá-las
-- exigiria recriá-las caso a decisão se reverta. O que precisava sumir era o
-- disparo automático.
--
-- Idempotente.

begin;

drop trigger if exists on_snapshot_inserted    on public.snapshots;
drop trigger if exists on_snapshot_suggest_ads on public.snapshots;

commit;

-- Conferência: devem sobrar três, e o de alertas entre eles.
select c.relname as tabela, t.tgname as gatilho, p.proname as funcao
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc  p on p.oid = t.tgfoid
 where not t.tgisinternal
 order by 1, 2;
