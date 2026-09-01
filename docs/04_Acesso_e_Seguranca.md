# Acesso e segurança — o achado mais grave dos três projetos migrados

**MEDIDO** em 2026-08-31, direto no banco de origem (`jqqcifqhkngpikhgjzig`),
por SQL Editor, com corpo de função lido por completo.

---

## O quadro em uma linha

Este projeto tem o **melhor desenho de RLS dos três** — `app_config` com RLS
sem policy nenhuma (deny total), `user_llm_keys`/`user_scraper_keys` com
`auth.uid() = user_id`, `set_llm_key`/`set_scraper_key` se auto-amarrando à
sessão. E mesmo assim tem o achado mais grave: **duas funções de leitura
contornam tudo isso**, porque confiam num parâmetro que o cliente controla.

---

# 🔴 1. `get_llm_key` e `get_scraper_key` — roubo de chave por usuário

## A prova

```sql
CREATE OR REPLACE FUNCTION public.get_llm_key(_user_id uuid, _provider text)
 RETURNS text
 SECURITY DEFINER
AS $function$
...
  select encrypted_key into enc
    from public.user_llm_keys
   where user_id = _user_id and provider = _provider;   -- 🔴 _user_id do cliente
  ...
  return pgp_sym_decrypt(enc, master_key);               -- devolve em CLARO
end;
$function$
```

`SECURITY DEFINER` ignora RLS por definição. `EXECUTE` estava concedido a
`anon` (confirmado em `docs/DB_CATALOGO.md`, seção 8). E o corpo **nunca
compara `_user_id` com `auth.uid()`** — aceita qualquer uuid.

**A exploração, hoje, só com a chave pública do bundle:**

```
POST /rest/v1/rpc/get_llm_key
{"_user_id": "<uuid de qualquer usuario>", "_provider": "anthropic"}
→ devolve a chave Anthropic/OpenAI/Gemini daquele usuário, em texto puro
```

`get_scraper_key(_user_id, _provider)` é a cópia exata do mesmo defeito,
vazando a chave Firecrawl/ScrapeCreators.

## Por que é pior que os achados do `lead-king` e do `diagnostico-vibe`

| | O que vazava |
|---|---|
| `lead-king` (`get_vault_key`) | chave **de projeto**, uma só para todos |
| `diagnostico-vibe` (`get_session_cookies`) | cookie de sessão, um por vez, exige saber o uuid da sessão |
| **`get_llm_key`/`get_scraper_key`** | chave **por usuário**, de serviços de terceiro pagos — o custo do abuso cai na conta pessoal da vítima, não no projeto |

## A tabela por trás está protegida — o RPC é quem fura

`user_llm_keys` e `user_scraper_keys` têm RLS ligada, com policy
`SELECT | public | (auth.uid() = user_id)`. Uma tentativa de `SELECT` direto
na tabela, com `anon`, devolveria vazio — `auth.uid()` é nulo para `anon`,
`null = user_id` nunca é verdadeiro. **O `SECURITY DEFINER` é exatamente o
mecanismo que existe para pular essa proteção**, e aqui foi usado sem a
checagem que deveria vir junto.

---

## 2. O contraste que prova que dava para fazer certo

| Função | Como se amarra ao chamador |
|---|---|
| `set_llm_key(_provider, _plain)` | `uid := auth.uid()` — **ignora** qualquer id vindo de fora |
| `set_scraper_key(_provider, _plain, _source)` | mesmo padrão |
| `is_admin()` | `where id = auth.uid()` |
| `accept_invite()` | `where email = (select email from auth.users where id = auth.uid())` |
| `invite-user` (Edge Function) | `userClient.auth.getUser()` + checa `profiles.role = 'admin'` |

**Cinco pontos diferentes do mesmo projeto fazem a amarração certa.**
`get_llm_key`/`get_scraper_key` são a exceção — provavelmente porque, ao
serem usadas *internamente* por outra Edge Function que já validou o
usuário (ex.: `generate-swot` chamando `get_llm_key(auth.uid(), ...)` depois
de já ter autenticado), pareceu redundante checar de novo. **Mas a função
está exposta via PostgREST, não só via chamada interna** — e é aí que a
suposição quebra.

---

## 3. Abuso de custo — `invoke_daily_crawl_scheduler` e `invoke_daily_ads_scheduler`

Não vazam segredo (testado: a `service_role_key` fica só no header HTTP
interno do `pg_net`, nunca no retorno). Mas são `RETURNS void` — não são
função de trigger — e tinham `EXECUTE` para `anon`:

```
POST /rest/v1/rpc/invoke_daily_crawl_scheduler
→ dispara crawl de TODOS os competitors de TODOS os usuários, de uma vez
```

Chamado em loop, estoura o orçamento de Firecrawl/ScrapeCreators/LLM sem
limite algum. É abuso de custo, não vazamento de segredo — mas real.

---

## 4. `app_config` está protegida corretamente — nota positiva

RLS ligada, **zero policies** definidas. Em Postgres isso é *deny total* —
mesmo com `GRANT SELECT` para `anon`, ninguém de fora lê a
`service_role_key` guardada ali. Confirmado nas seções 5 e 6 do
`DB_CATALOGO.md`: a tabela não aparece na seção de policies. É o desenho
certo para guardar algo sensível numa tabela comum quando não há Vault.

---

## Estado: nada vazou ainda

As 15 tabelas — incluindo `user_llm_keys` e `user_scraper_keys` — estão com
**0 linhas**, confirmado na extração de 31/08. A exposição existe por
desenho, mas não tem o que roubar hoje.

---

## Para a VPS — o que muda por arquitetura, e o que precisa de correção deliberada

| # | O quê | Resolve por arquitetura ou precisa de correção? |
|---|---|---|
| 1 | `get_llm_key`/`get_scraper_key` sem checagem de dono | 🔴 **precisa de correção deliberada** — sem PostgREST publicando RPC, a função só é alcançável pelo próprio serviço, mas o serviço ainda precisa aplicar a checagem antes de chamar. Marcado como `TODO(seguranca)` no `DB_SCHEMA.sql`, corpo original preservado, correção **não aplicada por mim** |
| 2 | `invoke_daily_*_scheduler` chamável direto | resolve por arquitetura — sem rota RPC pública, só o cron interno da VPS chama |
| 3 | `app_config`/`service_role_key` | resolve por arquitetura — vira `.env` do serviço, o conceito de "chave de serviço que o banco precisa conhecer" desaparece |
| 4 | Modelo de admin/convite (`invite-user`, `enforce_invite_only`) | portar como está — a trava de `role='admin'` já está certa |

⚠️ Nada disso foi corrigido no Supabase de origem nem alterado no
`DB_SCHEMA.sql` além do que está documentado. Este documento descreve o
estado em 2026-08-31.
