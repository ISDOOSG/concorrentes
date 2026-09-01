# Corpo das funções do banco — Análise de Concorrentes

> **Fonte:** `pg_get_functiondef()` no Supabase `jqqcifqhkngpikhgjzig`,
> 2026-08-31. CSV cru em `docs/origem/extracao.csv`.

🚨 **As 17 funções tinham `EXECUTE` concedido a `anon`.** Duas são
exploráveis de verdade — `get_llm_key` e `get_scraper_key` — porque não se
amarram a `auth.uid()`. As demais, ou se auto-amarram corretamente, ou não
devolvem nada sensível. Ver `04_Acesso_e_Seguranca.md` para o quadro
completo.

---

### accept_invite

✅ Também auto-amarrada a `auth.uid()`. Mesma exigência de shim que
`is_admin` para compilar.

```sql
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
$function$

```

### decrypt_llm_key

```sql
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
$function$

```

### encrypt_llm_key

```sql
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
$function$

```

### enforce_invite_only

⚠️ Dispara como trigger `BEFORE INSERT` em `auth.users` — schema que não
existe fora do Supabase. **Não aparece na extração de triggers** (o
`PADRAO` só lê triggers de tabelas do schema `public`). Precisa de
equivalente na rotina de cadastro do `public.usuario`.

```sql
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
$function$

```

### get_llm_key

🔴 **CRÍTICO — sem verificação de dono, `EXECUTE` para `anon`.** Recebe
`_user_id` do chamador e nunca confere se bate com `auth.uid()`. Devolve
a chave Anthropic/OpenAI/Gemini de **qualquer usuário**, em texto puro,
para quem tiver só a chave pública do bundle. Testado: a função em si
roda fora do Supabase sem erro — o defeito é lógico, não de portabilidade.

```sql
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
$function$

```

### get_scraper_key

🔴 **CRÍTICO — mesmo defeito de `get_llm_key`.** Devolve a chave
Firecrawl/ScrapeCreators de qualquer usuário, sem checar dono.

```sql
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
$function$

```

### handle_new_user

⚠️ Mesma situação de `enforce_invite_only` — trigger em `auth.users`,
invisível na extração, precisa de equivalente na rotina de cadastro.

```sql
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
$function$

```

### invoke_crawl_competitor

```sql
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
$function$

```

### invoke_daily_ads_scheduler

⚠️ Mesma classe de `invoke_daily_crawl_scheduler` — chamável direto,
gera custo de API de terceiro se exposta.

```sql
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
$function$

```

### invoke_daily_crawl_scheduler

⚠️ Não é função de trigger (`RETURNS void`) — é **chamável direto** via
RPC, e tinha `EXECUTE` para `anon`. Dispara crawl de todos os
competitors de todos os usuários. Na VPS, só o cron interno deve chamar.

```sql
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
$function$

```

### invoke_detect_changes

```sql
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
$function$

```

### invoke_generate_alerts

```sql
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
$function$

```

### invoke_suggest_ads_links

⚠️ Mesma classe — mas esta É trigger (dispara em `snapshots`), então o
risco de chamada direta é menor (função de trigger recusa contexto sem
`NEW`).

```sql
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
end; $function$

```

### is_admin

✅ Auto-amarrada a `auth.uid()`. `LANGUAGE sql` — por isso é validada
contra objetos reais no momento do `CREATE`, não só no uso; precisou do
shim `auth.uid()`/`auth.users` para sequer compilar fora do Supabase.

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$function$

```

### set_llm_key

✅ **Faz certo, e é o padrão a copiar nas duas de cima.** Usa
`uid := auth.uid()` internamente — nunca aceita user_id do cliente.
Testado na VPS: falha com `not authenticated` quando `auth.uid()` é nulo
(o shim de compatibilidade sempre devolve nulo) — confirma que a função
precisa de auth real antes de funcionar, mas a lógica de dono está certa.

```sql
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
$function$

```

### set_scraper_key

✅ Mesmo padrão correto de `set_llm_key`.

```sql
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
$function$

```

### tg_seo_analyses_updated_at

```sql
CREATE OR REPLACE FUNCTION public.tg_seo_analyses_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$

```

