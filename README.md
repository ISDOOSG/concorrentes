# Análise de Concorrentes · Viver de IA

Solução whitelabel de **inteligência competitiva**: monitore o site, os anúncios
e o Instagram dos seus concorrentes, receba alertas de mudança e análises
SWOT/SEO geradas por IA.

**App publicado**: https://compete-sparkle-cloud.lovable.app
**Editor Lovable**: https://lovable.dev/projects/edf13bb6-8a7a-4aba-a5e7-bef181acb196

---

## Como colocar a SUA cópia no ar (Remix)

1. **Remix** deste projeto no Lovable (o banco nasce zerado; as migrations em
   `supabase/migrations/` provisionam o schema completo, RLS, triggers e crons).
2. **Bootstrap (1x, obrigatório)**: chame a edge function `bootstrap-app-config`
   do seu projeto novo — ela grava `functions_base_url` e `service_role_key` no
   `app_config` (necessário para o crawl automático e os agendamentos):
   ```sh
   curl -X POST "https://SEU-PROJETO.supabase.co/functions/v1/bootstrap-app-config" \
     -H "Content-Type: application/json" -d '{}'
   ```
   A chamada é aberta apenas enquanto a configuração estiver vazia; depois disso
   só aceita a service role key.
3. Crie sua conta no app (entra direto, sem confirmação de e-mail). **O
   primeiro usuário do banco vira automaticamente o administrador.**
4. Siga o item "Chaves" abaixo.

## Acesso e equipe (convite obrigatório)

- O **primeiro usuário** criado após o remix é o **administrador**.
- A partir daí o **cadastro direto fica bloqueado**: quem tentar se cadastrar
  vê "o acesso é por convite".
- O admin convida pela UI em **Configurações → Equipe**: digita o e-mail e o
  Supabase **envia automaticamente o e-mail de convite** (mailer embutido).
  O convidado clica no link, cai em `/convite`, define nome e senha e entra
  como **membro**.
- Convites pendentes aparecem na mesma tela e podem ser removidos.
- Observação: o e-mail sai do mailer padrão do Supabase. Para volume alto ou
  domínio próprio, configure SMTP custom no projeto.

## O que funciona SEM nenhuma chave

- Login, dashboard, telas, navegação (desktop e mobile), convites de equipe.
- **SWOT por IA** e **Análise SEO por IA** — usam o Lovable AI do seu projeto
  (a `LOVABLE_API_KEY` viaja com o Remix; o custo entra no seu plano Lovable).
- **Modo demonstração** (botão "Demo" no topo): dados simulados para apresentar
  a plataforma sem configurar nada.

## O que exige chave (BYOK — cada usuário cadastra a sua)

| Recurso | Chave | Onde obter | Onde cadastrar no app |
|---|---|---|---|
| Crawl do site do concorrente (snapshots, mudanças, alertas) | Firecrawl (`fc-…`) | https://firecrawl.dev | Configurações → Integrações |
| Anúncios Meta/Google + Instagram do concorrente | ScrapeCreators | https://scrapecreators.com | Configurações → Integrações |
| LLM próprio no lugar do Lovable AI (opcional) | Anthropic / OpenAI / Gemini | consoles dos provedores | Configurações → Conta · LLM |

As chaves são **criptografadas no banco** (AES-256 via `pgcrypto`; segredo em
`app_config`, legível só pelo `service_role`) e **nunca voltam ao browser** —
o front só vê os 4 últimos caracteres. Sem chave, as ações correspondentes
falham com mensagem apontando a tela de configuração (não há fallback
silencioso para chaves de ambiente).

## Monitoramento automático

- Ao **adicionar um concorrente**, o primeiro crawl dispara sozinho (trigger).
- **Crons diários** (UTC): `daily-crawl` às 06:00 re-crawleia todos os
  concorrentes ativos; `daily-ads` às 07:00 atualiza os anúncios vinculados.
- A cada novo snapshot, a edge `detect-changes` compara com o anterior e, se o
  conteúdo mudou, classifica a mudança por IA (tipo/severidade/resumo) e gera
  **alerta in-app** para severidade `warning`/`critical`.

## O que a solução ainda NÃO faz

- **Não envia alerta por e-mail/WhatsApp** — alertas são apenas dentro do app.
- **Não mede tráfego/keywords reais** (Similarweb/Semrush não integrados); os
  cartões de tráfego mostram estado vazio até existir fonte de dados.
- **Não compara posições orgânicas de SEO** (você vs concorrente) — a aba SEO
  entrega a análise por IA do site, o comparativo de keywords está em roadmap.
- **Não exporta CSV/PDF** — o botão "Exportar" do topo é decorativo por ora.
- **Sem billing/planos** — "Plano Free" é rótulo; a tabela `profiles` tem
  `plan`/`url_quota` prontos, mas nada é cobrado nem limitado hoje.

## Desenvolvimento local

```sh
git clone <este-repo>
cd <pasta>
npm i
npm run dev   # aponta para o MESMO backend do projeto (Supabase de produção)
```

Stack: TanStack Start + React 19 + Supabase (Lovable Cloud). Server functions
ficam em `src/server-fns/` (o padrão `src/server/` é bloqueado pelo
import-protection do Lovable) e o middleware global de auth está em
`src/start.ts` — sem ele, todo server function responde 401.
