-- ============================================================
-- Analise de Concorrentes / Viver de IA -- esquema para o Postgres da VPS
--
-- Gerado a partir de docs/origem/extracao.csv (Supabase jqqcifqhkngpikhgjzig)
-- em 2026-08-31, via PADRAO_extrair_supabase.sql.
--
-- O QUE FOI RETIRADO, E POR QUE
--   * as policies de RLS  -> usam auth.uid(), que e do Supabase
--   * os GRANT para anon/authenticated/service_role -> papeis inexistentes aqui
--   * a referencia a auth.users -> trocada por public.usuario
--
-- 🚨 NAO REPETIR: get_llm_key(_user_id, _provider) e get_scraper_key(_user_id,
--    _provider) estavam com EXECUTE para 'anon' e NAO verificavam se
--    _user_id era quem chamava -- qualquer um com a chave publica do
--    bundle roubava a chave Anthropic/OpenAI/Gemini ou Firecrawl/
--    ScrapeCreators de QUALQUER usuario. Achado em 31/08. Ver o TODO
--    marcado nas duas funcoes, secao 3 abaixo -- o corpo original foi
--    preservado verbatim; a checagem de dono faltando fica marcada, nao
--    aplicada por mim (decisao de quem revisar).
--
-- ✅ O QUE JA VEM CERTO NO ORIGINAL, E NAO E PRA MUDAR:
--    set_llm_key/set_scraper_key usam uid := auth.uid() internamente, nunca
--    confiam em parametro do cliente -- e o padrao a copiar nas duas de cima.
--    is_admin() e accept_invite() tambem se auto-amarram a auth.uid().
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid() e pgp_sym_*

-- ------------------------------------------------------------
-- 0. IDENTIDADE -- substitui auth.users do Supabase
-- ------------------------------------------------------------
-- TODO(decisao): tabela minima, so para as FKs fecharem. Definir login.
CREATE TABLE IF NOT EXISTS public.usuario (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text NOT NULL UNIQUE,
    nome        text NOT NULL,
    senha_hash  text,
    ativo       boolean NOT NULL DEFAULT true,
    criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 0.1 SHIM DE COMPATIBILIDADE -- so para o DDL original CARREGAR
-- ------------------------------------------------------------
-- 🚨 auth.users e auth.uid() sao do Supabase Auth. Varias funcoes deste
--    projeto (accept_invite, is_admin -- as LANGUAGE sql) referenciam os
--    dois DENTRO DO CORPO, nao so em FK -- e funcao LANGUAGE sql e
--    validada contra objetos reais no momento do CREATE, nao so no uso.
--    Sem isto, o CREATE FUNCTION falha antes mesmo de existir para editar.
--
--    auth.users vira VIEW sobre public.usuario (id, email) -- nunca uma
--    segunda fonte de identidade. auth.uid() devolve NULL sempre: e so
--    para o corpo COMPILAR, nao funciona de verdade sem sessao real.
--    TODO(decisao C.8): escrever a versao real de auth.uid() (ler de uma
--    variavel de sessao/JWT do servico da VPS) antes de usar em producao.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE VIEW auth.users AS SELECT id, email FROM public.usuario;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid;
$$;

-- ------------------------------------------------------------
-- 1. TABELAS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id                           uuid NOT NULL,
    full_name                    text,
    plan                         text NOT NULL DEFAULT 'free'::text,
    url_quota                    integer NOT NULL DEFAULT 5,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    role                         text NOT NULL DEFAULT 'member'::text,
    email                        text,
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.usuario(id) ON DELETE CASCADE,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])))
);

CREATE TABLE IF NOT EXISTS public.invites (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    email                        text NOT NULL,
    invited_by                   uuid,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    accepted_at                  timestamptz,
    CONSTRAINT invites_email_key UNIQUE (email),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.usuario(id) ON DELETE SET NULL,
    CONSTRAINT invites_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.app_config (
    key                          text NOT NULL,
    value                        text NOT NULL,
    CONSTRAINT app_config_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS public.competitors (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id                      uuid NOT NULL,
    name                         text NOT NULL,
    url                          text NOT NULL,
    status                       text NOT NULL DEFAULT 'active'::text,
    last_crawled_at              timestamptz,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    crawl_status                 text NOT NULL DEFAULT 'never'::text,
    crawl_error                  text,
    crawl_started_at             timestamptz,
    facebook_page_id             text,
    google_advertiser_id         text,
    last_ads_fetched_at          timestamptz,
    facebook_page_suggestion     text,
    google_advertiser_suggestion text,
    ads_link_confidence          jsonb,
    ads_link_reasoning           text,
    ads_link_suggested_at        timestamptz,
    instagram_handle             text,
    instagram_handle_suggestion  text,
    last_instagram_fetched_at    timestamptz,
    CONSTRAINT competitors_crawl_status_check CHECK ((crawl_status = ANY (ARRAY['never'::text, 'queued'::text, 'running'::text, 'success'::text, 'failed'::text]))),
    CONSTRAINT competitors_pkey PRIMARY KEY (id),
    CONSTRAINT competitors_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text]))),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT competitors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE,
    CONSTRAINT competitors_user_id_url_key UNIQUE (user_id, url)
);

CREATE TABLE IF NOT EXISTS public.snapshots (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id                      uuid NOT NULL,
    competitor_id                uuid NOT NULL,
    crawled_at                   timestamptz NOT NULL DEFAULT now(),
    content_hash                 text NOT NULL,
    raw_text                     text,
    structured_data              jsonb,
    traffic_data                 jsonb,
    screenshot_path              text,
    source                       text NOT NULL,
    cost_cents                   integer DEFAULT 0,
    CONSTRAINT snapshots_competitor_id_fkey FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    CONSTRAINT snapshots_pkey PRIMARY KEY (id),
    CONSTRAINT snapshots_source_check CHECK ((source = ANY (ARRAY['firecrawl'::text, 'scrapfly'::text, 'direct'::text]))),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.changes (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id                      uuid NOT NULL,
    competitor_id                uuid NOT NULL,
    from_snapshot_id             uuid NOT NULL,
    to_snapshot_id               uuid NOT NULL,
    detected_at                  timestamptz NOT NULL DEFAULT now(),
    change_type                  text NOT NULL,
    severity                     text NOT NULL,
    summary                      text NOT NULL,
    diff                         jsonb NOT NULL,
    alerted                      boolean NOT NULL DEFAULT false,
    CONSTRAINT changes_change_type_check CHECK ((change_type = ANY (ARRAY['price'::text, 'copy'::text, 'feature'::text, 'design'::text, 'traffic'::text]))),
    CONSTRAINT changes_competitor_id_fkey FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    CONSTRAINT changes_from_snapshot_id_fkey FOREIGN KEY (from_snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
    CONSTRAINT changes_pkey PRIMARY KEY (id),
    CONSTRAINT changes_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text]))),
    CONSTRAINT changes_to_snapshot_id_fkey FOREIGN KEY (to_snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.alerts (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id                      uuid NOT NULL,
    change_id                    uuid,
    channel                      text NOT NULL DEFAULT 'in_app'::text,
    read_at                      timestamptz,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT alerts_change_id_fkey FOREIGN KEY (change_id) REFERENCES changes(id) ON DELETE CASCADE,
    CONSTRAINT alerts_pkey PRIMARY KEY (id),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.swot_reports (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id                      uuid NOT NULL,
    competitor_id                uuid NOT NULL,
    generated_at                 timestamptz NOT NULL DEFAULT now(),
    strengths                    jsonb NOT NULL,
    weaknesses                   jsonb NOT NULL,
    opportunities                jsonb NOT NULL,
    threats                      jsonb NOT NULL,
    llm_model                    text NOT NULL,
    cost_cents                   integer DEFAULT 0,
    CONSTRAINT swot_reports_competitor_id_fkey FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    CONSTRAINT swot_reports_pkey PRIMARY KEY (id),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT swot_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE
);

-- 🚨 TODO(revisao): no Supabase, seo_analyses NAO tinha FK declarada em
--    user_id/competitor_id -- referencia solta, sem integridade.
--    Colunas mantidas como uuid comum, igual a origem. Decidir se
--    entra FK (e qual ON DELETE) ao revisar.
CREATE TABLE IF NOT EXISTS public.seo_analyses (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    competitor_id                uuid NOT NULL,
    user_id                      uuid NOT NULL,
    source_snapshot_id           uuid,
    model                        text NOT NULL,
    score                        integer,
    summary                      text,
    strengths                    jsonb NOT NULL DEFAULT '[]'::jsonb,
    weaknesses                   jsonb NOT NULL DEFAULT '[]'::jsonb,
    opportunities                jsonb NOT NULL DEFAULT '[]'::jsonb,
    recommendations              jsonb NOT NULL DEFAULT '[]'::jsonb,
    target_keywords              jsonb NOT NULL DEFAULT '[]'::jsonb,
    meta                         jsonb NOT NULL DEFAULT '{}'::jsonb,
    analyzed_at                  timestamptz NOT NULL DEFAULT now(),
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT seo_analyses_competitor_id_fkey FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    CONSTRAINT seo_analyses_pkey PRIMARY KEY (id),
    CONSTRAINT seo_analyses_source_snapshot_id_fkey FOREIGN KEY (source_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL
);

-- 🚨 TODO(revisao): no Supabase, social_snapshots NAO tinha FK declarada em
--    user_id/competitor_id -- referencia solta, sem integridade.
--    Colunas mantidas como uuid comum, igual a origem. Decidir se
--    entra FK (e qual ON DELETE) ao revisar.
CREATE TABLE IF NOT EXISTS public.social_snapshots (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id                      uuid NOT NULL,
    competitor_id                uuid NOT NULL,
    platform                     text NOT NULL DEFAULT 'instagram'::text,
    handle                       text NOT NULL,
    fetched_at                   timestamptz NOT NULL DEFAULT now(),
    fetched_date                 date NOT NULL DEFAULT (now())::date,
    followers                    integer,
    following                    integer,
    posts_count                  integer,
    is_verified                  boolean,
    is_business                  boolean,
    bio                          text,
    external_url                 text,
    category                     text,
    profile_pic_url              text,
    recent_posts                 jsonb NOT NULL DEFAULT '[]'::jsonb,
    raw                          jsonb,
    cost_credits                 integer NOT NULL DEFAULT 1,
    CONSTRAINT social_snapshots_pkey PRIMARY KEY (id),
    CONSTRAINT social_snapshots_unique_daily UNIQUE (competitor_id, platform, fetched_date)
);

-- 🚨 TODO(revisao): no Supabase, social_analyses NAO tinha FK declarada em
--    user_id/competitor_id -- referencia solta, sem integridade.
--    Colunas mantidas como uuid comum, igual a origem. Decidir se
--    entra FK (e qual ON DELETE) ao revisar.
CREATE TABLE IF NOT EXISTS public.social_analyses (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id                      uuid NOT NULL,
    competitor_id                uuid NOT NULL,
    platform                     text NOT NULL DEFAULT 'instagram'::text,
    source_snapshot_id           uuid,
    model                        text NOT NULL,
    summary                      text,
    cadence                      jsonb NOT NULL DEFAULT '{}'::jsonb,
    format_mix                   jsonb NOT NULL DEFAULT '{}'::jsonb,
    themes                       jsonb NOT NULL DEFAULT '[]'::jsonb,
    engagement                   jsonb NOT NULL DEFAULT '{}'::jsonb,
    top_posts                    jsonb NOT NULL DEFAULT '[]'::jsonb,
    insights                     jsonb NOT NULL DEFAULT '[]'::jsonb,
    cost_cents                   integer NOT NULL DEFAULT 0,
    analyzed_at                  timestamptz NOT NULL DEFAULT now(),
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT social_analyses_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ads_snapshots (
    id                           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id                      uuid NOT NULL,
    competitor_id                uuid NOT NULL,
    source                       text NOT NULL,
    ad_archive_id                text NOT NULL,
    fetched_at                   timestamptz NOT NULL DEFAULT now(),
    fetched_date                 date,
    active                       boolean,
    body_text                    text,
    cta_text                     text,
    cta_url                      text,
    page_name                    text,
    creatives                    jsonb,
    targeting                    jsonb,
    spend_estimate               jsonb,
    impressions_estimate         jsonb,
    start_date                   timestamptz,
    end_date                     timestamptz,
    platforms                    text[],
    raw                          jsonb,
    CONSTRAINT ads_snapshots_competitor_id_fkey FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
    CONSTRAINT ads_snapshots_pkey PRIMARY KEY (id),
    CONSTRAINT ads_snapshots_source_check CHECK ((source = ANY (ARRAY['meta'::text, 'google'::text]))),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT ads_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_llm_settings (
    user_id                      uuid NOT NULL,
    provider                     text NOT NULL DEFAULT 'lovable'::text,
    model_classification         text,
    model_swot                   text,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_llm_settings_pkey PRIMARY KEY (user_id),
    CONSTRAINT user_llm_settings_provider_check CHECK ((provider = ANY (ARRAY['lovable'::text, 'anthropic'::text, 'openai'::text, 'gemini'::text]))),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT user_llm_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_llm_keys (
    user_id                      uuid NOT NULL,
    provider                     text NOT NULL,
    encrypted_key                bytea NOT NULL,
    key_hint                     text,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_llm_keys_pkey PRIMARY KEY (user_id, provider),
    CONSTRAINT user_llm_keys_provider_check CHECK ((provider = ANY (ARRAY['anthropic'::text, 'openai'::text, 'gemini'::text]))),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT user_llm_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_scraper_keys (
    user_id                      uuid NOT NULL,
    provider                     text NOT NULL,
    encrypted_key                bytea NOT NULL,
    key_hint                     text,
    source                       text NOT NULL DEFAULT 'manual'::text,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_scraper_keys_pkey PRIMARY KEY (user_id, provider),
    CONSTRAINT user_scraper_keys_provider_check CHECK ((provider = ANY (ARRAY['firecrawl'::text, 'scrapecreators'::text]))),
    CONSTRAINT user_scraper_keys_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'lovable_connector'::text]))),
    -- reapontada de auth.users para public.usuario,
    CONSTRAINT user_scraper_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuario(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 2. INDICES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ads_snapshots_competitor_idx ON public.ads_snapshots USING btree (competitor_id, source, fetched_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ads_snapshots_dedupe_idx ON public.ads_snapshots USING btree (competitor_id, source, ad_archive_id, fetched_date);
CREATE INDEX IF NOT EXISTS ads_snapshots_user_idx ON public.ads_snapshots USING btree (user_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS changes_user_detected_at_idx ON public.changes USING btree (user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS competitors_crawl_status_idx ON public.competitors USING btree (crawl_status) WHERE (crawl_status = ANY (ARRAY['queued'::text, 'running'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS seo_analyses_competitor_unique ON public.seo_analyses USING btree (competitor_id);
CREATE INDEX IF NOT EXISTS seo_analyses_user_idx ON public.seo_analyses USING btree (user_id);
CREATE INDEX IF NOT EXISTS snapshots_competitor_crawled_at_idx ON public.snapshots USING btree (competitor_id, crawled_at DESC);
CREATE INDEX IF NOT EXISTS social_analyses_competitor_idx ON public.social_analyses USING btree (competitor_id, platform, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS social_snapshots_competitor_idx ON public.social_snapshots USING btree (competitor_id, platform, fetched_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS social_snapshots_unique_daily ON public.social_snapshots USING btree (competitor_id, platform, fetched_date);

-- ------------------------------------------------------------
-- 3. FUNCOES
-- ------------------------------------------------------------
-- 🚨 As 17 funcoes tinham EXECUTE para 'anon' no Supabase. As duas abaixo
--    sao as unicas onde isso e realmente exploravel (as outras, ou se
--    auto-amarram a auth.uid(), ou nao devolvem nada sensivel).

-- ---------- accept_invite
CREATE OR REPLACE FUNCTION public.accept_invite()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.invites
     set accepted_at = now()
   where accepted_at is null
     and lower(email) = lower((select email from auth.users where id = auth.uid()));
$function$;

-- ---------- decrypt_llm_key
CREATE OR REPLACE FUNCTION public.decrypt_llm_key(enc bytea)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  master_key text;
begin
  master_key := current_setting('app.llm_key_encryption_secret', true);
  if master_key is null or master_key = '' then
    select value into master_key from public.app_config where key = 'llm_key_encryption_secret';
  end if;
  if master_key is null or master_key = '' then
    raise exception 'LLM_KEY_ENCRYPTION_SECRET not configured';
  end if;
  return pgp_sym_decrypt(enc, master_key);
end;
$function$;

-- ---------- encrypt_llm_key
CREATE OR REPLACE FUNCTION public.encrypt_llm_key(plain text)
 RETURNS bytea
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  master_key text;
begin
  master_key := current_setting('app.llm_key_encryption_secret', true);
  if master_key is null or master_key = '' then
    -- Fall back to app_config table
    select value into master_key from public.app_config where key = 'llm_key_encryption_secret';
  end if;
  if master_key is null or master_key = '' then
    raise exception 'LLM_KEY_ENCRYPTION_SECRET not configured';
  end if;
  return pgp_sym_encrypt(plain, master_key, 'cipher-algo=aes256')::bytea;
end;
$function$;

-- ---------- enforce_invite_only
CREATE OR REPLACE FUNCTION public.enforce_invite_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (select count(*) from auth.users) > 0
     and not exists (
       select 1 from public.invites
        where lower(email) = lower(new.email) and accepted_at is null
     )
  then
    raise exception 'signup_by_invite_only';
  end if;
  return new;
end;
$function$;

-- ---------- get_llm_key
-- 🚨 TODO(seguranca): get_llm_key recebe _user_id do CHAMADOR e nunca
--    verifica se bate com quem esta autenticado. Corpo original
--    preservado abaixo -- ANTES de expor isto de novo, adicionar:
--      if _user_id <> auth.uid() and not public.is_admin() then
--        raise exception 'not authorized';
--      end if;
--    (mesmo padrao que set_llm_key ja usa,
--    so que na leitura em vez da escrita.)
CREATE OR REPLACE FUNCTION public.get_llm_key(_user_id uuid, _provider text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  master_key text;
  enc bytea;
begin
  master_key := current_setting('app.llm_key_encryption_secret', true);
  if master_key is null or master_key = '' then
    select value into master_key from public.app_config where key = 'llm_key_encryption_secret';
  end if;
  if master_key is null or master_key = '' then
    raise exception 'encryption master key not configured';
  end if;

  select encrypted_key into enc
    from public.user_llm_keys
   where user_id = _user_id and provider = _provider;

  if enc is null then
    return null;
  end if;

  return pgp_sym_decrypt(enc, master_key);
end;
$function$;

-- ---------- get_scraper_key
-- 🚨 TODO(seguranca): get_scraper_key recebe _user_id do CHAMADOR e nunca
--    verifica se bate com quem esta autenticado. Corpo original
--    preservado abaixo -- ANTES de expor isto de novo, adicionar:
--      if _user_id <> auth.uid() and not public.is_admin() then
--        raise exception 'not authorized';
--      end if;
--    (mesmo padrao que set_scraper_key ja usa,
--    so que na leitura em vez da escrita.)
CREATE OR REPLACE FUNCTION public.get_scraper_key(_user_id uuid, _provider text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  master_key text;
  enc bytea;
begin
  master_key := current_setting('app.llm_key_encryption_secret', true);
  if master_key is null or master_key = '' then
    select value into master_key from public.app_config where key = 'llm_key_encryption_secret';
  end if;
  if master_key is null or master_key = '' then
    raise exception 'encryption master key not configured';
  end if;

  select encrypted_key into enc
    from public.user_scraper_keys
   where user_id = _user_id and provider = _provider;

  if enc is null then
    return null;
  end if;

  return pgp_sym_decrypt(enc, master_key);
end;
$function$;

-- ---------- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_first boolean;
begin
  select count(*) = 1 into is_first from auth.users;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    case when is_first then 'admin' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- ---------- invoke_crawl_competitor
CREATE OR REPLACE FUNCTION public.invoke_crawl_competitor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  fn_url text;
  service_key text;
begin
  select value into fn_url from public.app_config where key = 'functions_base_url';
  select value into service_key from public.app_config where key = 'service_role_key';

  if fn_url is null or fn_url = '' or service_key is null or service_key = '' then
    update public.competitors
       set crawl_status = 'failed',
           crawl_error  = 'Configuração inicial pendente: o dono da plataforma precisa chamar a function bootstrap-app-config (README, passo 1). Depois use "Crawlear agora".'
     where id = new.id;
    return new;
  end if;

  update public.competitors set crawl_status = 'queued' where id = new.id;

  perform net.http_post(
    url := fn_url || '/crawl-competitor',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || service_key
    ),
    body := jsonb_build_object('competitor_id', new.id, 'user_id', new.user_id)
  );
  return new;
end;
$function$;

-- ---------- invoke_daily_ads_scheduler
-- ⚠️ TODO(revisao): invoke_daily_ads_scheduler nao e funcao de trigger (RETURNS void),
--    entao e chamavel direto. Na VPS, so o cron interno deve chamar --
--    nao expor como rota comum.
CREATE OR REPLACE FUNCTION public.invoke_daily_ads_scheduler()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  fn_url text;
  service_key text;
begin
  select value into fn_url from public.app_config where key = 'functions_base_url';
  select value into service_key from public.app_config where key = 'service_role_key';
  if fn_url is null or fn_url = '' or service_key is null or service_key = '' then
    raise warning 'invoke_daily_ads_scheduler: app_config incompleto (rode bootstrap-app-config)';
    return;
  end if;

  perform net.http_post(
    url := fn_url || '/daily-ads-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
end;
$function$;

-- ---------- invoke_daily_crawl_scheduler
-- ⚠️ TODO(revisao): invoke_daily_crawl_scheduler nao e funcao de trigger (RETURNS void),
--    entao e chamavel direto. Na VPS, so o cron interno deve chamar --
--    nao expor como rota comum.
CREATE OR REPLACE FUNCTION public.invoke_daily_crawl_scheduler()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  fn_url text;
  service_key text;
  rec record;
begin
  select value into fn_url from public.app_config where key = 'functions_base_url';
  select value into service_key from public.app_config where key = 'service_role_key';
  if fn_url is null or fn_url = '' or service_key is null or service_key = '' then
    raise warning 'invoke_daily_crawl_scheduler: app_config incompleto (rode bootstrap-app-config)';
    return;
  end if;

  for rec in
    select id, user_id from public.competitors where status = 'active'
  loop
    perform net.http_post(
      url := fn_url || '/crawl-competitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('competitor_id', rec.id, 'user_id', rec.user_id)
    );
  end loop;
end;
$function$;

-- ---------- invoke_detect_changes
CREATE OR REPLACE FUNCTION public.invoke_detect_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  fn_url text;
  service_key text;
begin
  select value into fn_url from public.app_config where key = 'functions_base_url';
  select value into service_key from public.app_config where key = 'service_role_key';

  if fn_url is null or fn_url = '' or service_key is null or service_key = '' then
    raise warning 'invoke_detect_changes: app_config incompleto (functions_base_url/service_role_key)';
    return new;
  end if;

  perform net.http_post(
    url := fn_url || '/detect-changes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('snapshot_id', new.id)
  );
  return new;
end;
$function$;

-- ---------- invoke_generate_alerts
CREATE OR REPLACE FUNCTION public.invoke_generate_alerts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.severity = 'info' then
    return new;
  end if;

  insert into public.alerts (user_id, change_id, channel)
  values (new.user_id, new.id, 'in_app');

  update public.changes set alerted = true where id = new.id;

  return new;
end;
$function$;

-- ---------- invoke_suggest_ads_links
-- ⚠️ TODO(revisao): invoke_suggest_ads_links nao e funcao de trigger (RETURNS void),
--    entao e chamavel direto. Na VPS, so o cron interno deve chamar --
--    nao expor como rota comum.
CREATE OR REPLACE FUNCTION public.invoke_suggest_ads_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  fn_url text;
  service_key text;
  user_id_val uuid;
  suggested timestamptz;
begin
  select user_id, ads_link_suggested_at into user_id_val, suggested
    from public.competitors where id = new.competitor_id;

  if suggested is not null and suggested > now() - interval '24 hours' then
    return new;
  end if;

  select value into fn_url from public.app_config where key = 'functions_base_url';
  select value into service_key from public.app_config where key = 'service_role_key';
  if fn_url is null or fn_url = '' or service_key is null or service_key = '' then
    return new;
  end if;

  perform net.http_post(
    url := fn_url || '/suggest-ads-links',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || service_key
    ),
    body := jsonb_build_object('competitor_id', new.competitor_id, 'user_id', user_id_val)
  );
  return new;
end; $function$;

-- ---------- is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$function$;

-- ---------- set_llm_key
CREATE OR REPLACE FUNCTION public.set_llm_key(_provider text, _plain text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  master_key text;
  uid uuid := auth.uid();
  hint text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if _provider not in ('anthropic','openai','gemini') then
    raise exception 'invalid provider: %', _provider;
  end if;
  if _plain is null or length(_plain) < 20 then
    raise exception 'key too short';
  end if;

  master_key := current_setting('app.llm_key_encryption_secret', true);
  if master_key is null or master_key = '' then
    select value into master_key from public.app_config where key = 'llm_key_encryption_secret';
  end if;
  if master_key is null or master_key = '' then
    raise exception 'encryption master key not configured';
  end if;

  hint := right(_plain, 4);

  insert into public.user_llm_keys (user_id, provider, encrypted_key, key_hint, created_at)
  values (
    uid,
    _provider,
    pgp_sym_encrypt(_plain, master_key, 'cipher-algo=aes256')::bytea,
    hint,
    now()
  )
  on conflict (user_id, provider) do update
    set encrypted_key = excluded.encrypted_key,
        key_hint = excluded.key_hint,
        created_at = now();
end;
$function$;

-- ---------- set_scraper_key
CREATE OR REPLACE FUNCTION public.set_scraper_key(_provider text, _plain text, _source text DEFAULT 'manual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  master_key text;
  uid uuid := auth.uid();
  hint text;
  key_clean text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if _provider not in ('firecrawl', 'scrapecreators') then
    raise exception 'invalid provider: %', _provider;
  end if;
  if _source not in ('manual', 'lovable_connector') then
    raise exception 'invalid source: %', _source;
  end if;

  key_clean := btrim(coalesce(_plain, ''));

  if key_clean ~ '\s' then
    raise exception 'key must not contain whitespace';
  end if;
  if length(key_clean) > 200 then
    raise exception 'key too long';
  end if;
  if _provider = 'firecrawl' then
    if key_clean not like 'fc-%' then
      raise exception 'firecrawl key must start with fc-';
    end if;
    if length(key_clean) < 20 then
      raise exception 'key too short';
    end if;
  else
    if length(key_clean) < 12 then
      raise exception 'key too short';
    end if;
  end if;

  master_key := current_setting('app.llm_key_encryption_secret', true);
  if master_key is null or master_key = '' then
    select value into master_key from public.app_config where key = 'llm_key_encryption_secret';
  end if;
  if master_key is null or master_key = '' then
    raise exception 'encryption master key not configured';
  end if;

  hint := right(key_clean, 4);

  insert into public.user_scraper_keys (user_id, provider, encrypted_key, key_hint, source, updated_at)
  values (
    uid,
    _provider,
    pgp_sym_encrypt(key_clean, master_key, 'cipher-algo=aes256')::bytea,
    hint,
    _source,
    now()
  )
  on conflict (user_id, provider) do update
    set encrypted_key = excluded.encrypted_key,
        key_hint = excluded.key_hint,
        source = excluded.source,
        updated_at = now();
end;
$function$;

-- ---------- tg_seo_analyses_updated_at
CREATE OR REPLACE FUNCTION public.tg_seo_analyses_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 4. TRIGGERS
-- ------------------------------------------------------------
-- ⚠️ handle_new_user e enforce_invite_only disparam em auth.users, que nao
--    existe fora do Supabase -- portanto os triggers deles TAMBEM nao vem
--    (nao aparecem nem na extracao: o PADRAO so le triggers do schema
--    public). Equivalente precisa ser escrito na rotina de cadastro do
--    novo public.usuario, chamando a logica de handle_new_user manualmente.

DROP TRIGGER IF EXISTS on_change_inserted ON public.changes;
CREATE TRIGGER on_change_inserted AFTER INSERT ON public.changes FOR EACH ROW EXECUTE FUNCTION invoke_generate_alerts();
DROP TRIGGER IF EXISTS on_competitor_inserted ON public.competitors;
CREATE TRIGGER on_competitor_inserted AFTER INSERT ON public.competitors FOR EACH ROW EXECUTE FUNCTION invoke_crawl_competitor();
DROP TRIGGER IF EXISTS set_updated_at_seo_analyses ON public.seo_analyses;
CREATE TRIGGER set_updated_at_seo_analyses BEFORE UPDATE ON public.seo_analyses FOR EACH ROW EXECUTE FUNCTION tg_seo_analyses_updated_at();
DROP TRIGGER IF EXISTS on_snapshot_inserted ON public.snapshots;
CREATE TRIGGER on_snapshot_inserted AFTER INSERT ON public.snapshots FOR EACH ROW EXECUTE FUNCTION invoke_detect_changes();
DROP TRIGGER IF EXISTS on_snapshot_suggest_ads ON public.snapshots;
CREATE TRIGGER on_snapshot_suggest_ads AFTER INSERT ON public.snapshots FOR EACH ROW EXECUTE FUNCTION invoke_suggest_ads_links();
DROP TRIGGER IF EXISTS tg_social_analyses_updated_at ON public.social_analyses;
CREATE TRIGGER tg_social_analyses_updated_at BEFORE UPDATE ON public.social_analyses FOR EACH ROW EXECUTE FUNCTION tg_seo_analyses_updated_at();

-- ------------------------------------------------------------
-- 5. O QUE NAO FOI TRAZIDO -- decisoes em aberto
-- ------------------------------------------------------------
-- 5.1 As policies de RLS do Supabase -- todas 'auth.uid() = user_id'.
--     TODO(decisao): filtro na aplicacao ou RLS proprio.
--
-- 5.2 handle_new_user (promove 1o usuario a admin) e enforce_invite_only
--     (bloqueia cadastro direto) rodavam como trigger em auth.users.
--     Precisam de equivalente na rotina de cadastro do public.usuario.
--
-- 5.3 app_config guarda functions_base_url e service_role_key -- no
--     Supabase, RLS ligada e ZERO policies = ninguem de fora le. Na VPS,
--     esses dois valores viram .env do servico, a tabela pode nem existir.
--
-- 5.4 seo_analyses, social_analyses, social_snapshots sem FK declarada
--     (ver TODOs na secao 1) -- decidir se corrige na migracao.

COMMIT;

