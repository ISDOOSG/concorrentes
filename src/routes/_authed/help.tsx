import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Rocket,
  UserPlus,
  Building,
  Radar,
  Bell,
  Columns3,
  ShieldCheck,
  Settings,
  Plug,
  HelpCircle,
  BookOpen,
  Lightbulb,
} from "lucide-react";

import { AppTopbar } from "@/components/ic/app-topbar";
import { UserMenu } from "@/components/ic/user-menu";
import { useAuthedUser } from "@/lib/use-authed-user";
import { useAlerts } from "@/lib/data/hooks/use-alerts";

export const Route = createFileRoute("/_authed/help")({
  component: HelpPage,
});

type GuideStep = {
  title: string;
  body: React.ReactNode;
};

type Guide = {
  id: string;
  icon: typeof Rocket;
  title: string;
  summary: string;
  steps: GuideStep[];
};

const GUIDES: Guide[] = [
  {
    id: "getting-started",
    icon: Rocket,
    title: "Começando — Visão geral em 5 minutos",
    summary:
      "Tour rápido pelo produto: o que é, como funciona e por onde começar.",
    steps: [
      {
        title: "1. O que é o Análise de Concorrentes",
        body: (
          <>
            Plataforma que monitora <strong>continuamente</strong> sites de
            concorrentes, capturando snapshots, screenshots, mudanças de copy /
            preço / feature e tráfego (Similarweb). Usa IA para classificar
            mudanças e gerar análises SWOT.
          </>
        ),
      },
      {
        title: "2. Crie sua conta",
        body: (
          <>
            Vá em <Link to="/signup">/signup</Link>, informe e-mail + senha.
            Você receberá um e-mail de confirmação. Depois faça login em{" "}
            <Link to="/login">/login</Link>.
          </>
        ),
      },
      {
        title: "3. Adicione seu primeiro concorrente",
        body: (
          <>
            No menu lateral clique em <strong>Adicionar concorrente</strong> ou
            vá direto em <Link to="/onboard">/onboard</Link>. Informe nome + URL
            (ex.: <code>https://concorrente.com</code>).
          </>
        ),
      },
      {
        title: "4. Acompanhe no Dashboard",
        body: (
          <>
            Em <Link to="/dashboard">/dashboard</Link> você vê todos os
            concorrentes em cards: última mudança, tráfego, alertas ativos.
          </>
        ),
      },
      {
        title: "5. Configure (opcional) suas chaves",
        body: (
          <>
            Em <Link to="/settings">Configurações</Link> você pode trazer sua
            própria chave de LLM (Anthropic, OpenAI, Gemini) e de scrapers
            (Firecrawl, ScrapFly, Similarweb) — modelo BYOK.
          </>
        ),
      },
    ],
  },
  {
    id: "auth",
    icon: UserPlus,
    title: "Conta — Cadastro, Login e Logout",
    summary: "Como criar conta, recuperar acesso e sair com segurança.",
    steps: [
      {
        title: "Criar conta",
        body: (
          <>
            Acesse <Link to="/signup">/signup</Link>. Preencha nome, e-mail e
            senha (mín. 8 caracteres). Confirme o e-mail clicando no link
            enviado para sua caixa de entrada.
          </>
        ),
      },
      {
        title: "Login",
        body: (
          <>
            Em <Link to="/login">/login</Link>, use seu e-mail e senha. Se
            esqueceu a senha, use o link &ldquo;Esqueci minha senha&rdquo;.
          </>
        ),
      },
      {
        title: "Logout",
        body: (
          <>
            No canto superior direito de qualquer tela, clique no avatar e
            escolha <strong>Sair</strong>. Sua sessão é encerrada
            imediatamente.
          </>
        ),
      },
    ],
  },
  {
    id: "competitors",
    icon: Building,
    title: "Concorrentes — Cadastro e gestão",
    summary: "Adicione, edite, pause ou remova concorrentes monitorados.",
    steps: [
      {
        title: "Adicionar concorrente",
        body: (
          <>
            Vá em <Link to="/onboard">Adicionar concorrente</Link>. Informe um{" "}
            <strong>nome amigável</strong> (ex.: &ldquo;HubSpot Marketing&rdquo;) e a{" "}
            <strong>URL completa</strong> (com <code>https://</code>). O sistema
            valida o domínio antes de salvar.
          </>
        ),
      },
      {
        title: "Lista de concorrentes",
        body: (
          <>
            Em <Link to="/competitors">/competitors</Link> você vê todos os
            concorrentes com status (ativo/pausado), data do último crawl e
            número de mudanças recentes.
          </>
        ),
      },
      {
        title: "Detalhe do concorrente",
        body: (
          <>
            Clique em qualquer card para abrir o detalhe. Lá você encontra abas
            para <strong>Snapshots</strong>, <strong>Mudanças</strong>,{" "}
            <strong>Screenshots</strong> e <strong>SWOT</strong>.
          </>
        ),
      },
      {
        title: "Pausar / Retomar / Remover",
        body: (
          <>
            Use o menu de ações (⋯) no card. Pausar interrompe o crawl diário
            sem perder o histórico. Remover apaga o concorrente e todos os
            dados associados (irreversível).
          </>
        ),
      },
      {
        title: "Crawlear agora (manual)",
        body: (
          <>
            No detalhe do concorrente, clique em <strong>Crawlear agora</strong>{" "}
            para forçar um snapshot imediato sem esperar a rotina diária.
          </>
        ),
      },
    ],
  },
  {
    id: "snapshots",
    icon: Radar,
    title: "Snapshots & Crawl Engine",
    summary: "Como funcionam as capturas periódicas do site monitorado.",
    steps: [
      {
        title: "O que é um snapshot",
        body: (
          <>
            É uma fotografia completa da página: HTML extraído, texto
            estruturado (headlines, CTAs, preços), screenshot e métricas de
            tráfego no momento da coleta.
          </>
        ),
      },
      {
        title: "Frequência",
        body: (
          <>
            Crawl automático <strong>diário</strong> às 03:00 UTC. Você também
            pode disparar manualmente a qualquer momento.
          </>
        ),
      },
      {
        title: "Provedores de scraping",
        body: (
          <>
            Tentamos primeiro o <strong>Firecrawl</strong>; se falhar, fallback
            automático para <strong>ScrapFly</strong>. Tráfego vem da{" "}
            <strong>Similarweb</strong> (cache de 30 dias por domínio).
          </>
        ),
      },
      {
        title: "Onde ver",
        body: (
          <>
            Detalhe do concorrente → aba <strong>Snapshots</strong>. Cada linha
            mostra data, fonte, preview do conteúdo e link para o screenshot.
          </>
        ),
      },
    ],
  },
  {
    id: "alerts",
    icon: Bell,
    title: "Alertas — Mudanças detectadas",
    summary: "Receba avisos quando algo importante mudar nos concorrentes.",
    steps: [
      {
        title: "Como são gerados",
        body: (
          <>
            A cada novo snapshot, comparamos com o anterior. Mudanças são
            classificadas via IA em: <strong>price</strong>,{" "}
            <strong>copy</strong>, <strong>feature</strong>,{" "}
            <strong>design</strong>, <strong>traffic</strong>.
          </>
        ),
      },
      {
        title: "Severidade",
        body: (
          <>
            <strong>Info</strong>: mudanças triviais (não geram alerta).{" "}
            <strong>Warning</strong>: copy/feature.{" "}
            <strong>Critical</strong>: preço alterado ou queda/alta de tráfego{" "}
            &gt; 30%.
          </>
        ),
      },
      {
        title: "Visualizar alertas",
        body: (
          <>
            Vá em <Link to="/alerts">/alerts</Link> ou clique no sino no topo. O
            badge no menu lateral mostra quantos não foram lidos.
          </>
        ),
      },
      {
        title: "Filtrar e marcar como lido",
        body: (
          <>
            Filtre por concorrente ou severidade. Clique em um alerta para
            marcá-lo como lido — ele sai da contagem do badge.
          </>
        ),
      },
    ],
  },
  {
    id: "compare",
    icon: Columns3,
    title: "Comparar concorrentes",
    summary: "Análise lado-a-lado de métricas entre múltiplos concorrentes.",
    steps: [
      {
        title: "Acessar",
        body: (
          <>
            No menu lateral, <Link to="/compare">Comparar</Link>.
          </>
        ),
      },
      {
        title: "Selecionar concorrentes",
        body: (
          <>
            Escolha de 2 a 5 concorrentes na lista. A tabela comparativa
            atualiza em tempo real com tráfego, bounce rate, top pages e
            mudanças recentes.
          </>
        ),
      },
      {
        title: "Gráficos de tendência",
        body: (
          <>
            Veja a evolução de tráfego dos últimos 30 dias em um line chart
            multi-linha (uma cor por concorrente).
          </>
        ),
      },
      {
        title: "Exportar",
        body: <>Use o botão de download no topo para baixar a tabela em CSV.</>,
      },
    ],
  },
  {
    id: "swot",
    icon: ShieldCheck,
    title: "Análise SWOT por IA",
    summary:
      "Gere relatórios estratégicos (Forças, Fraquezas, Oportunidades, Ameaças) com IA.",
    steps: [
      {
        title: "Quando gerar",
        body: (
          <>
            Após acumular pelo menos algumas semanas de snapshots e mudanças do
            concorrente — quanto mais histórico, mais rica a análise.
          </>
        ),
      },
      {
        title: "Como gerar",
        body: (
          <>
            Detalhe do concorrente → aba <strong>SWOT</strong> → botão{" "}
            <strong>Gerar SWOT</strong>. A IA agrega últimos 30 dias e produz
            JSON estruturado em 4 quadrantes.
          </>
        ),
      },
      {
        title: "Modelo usado",
        body: (
          <>
            Por padrão o modelo configurado em &ldquo;SWOT&rdquo; nas suas
            Configurações de LLM (ex.: Claude Sonnet 4.6 ou GPT-5).
          </>
        ),
      },
      {
        title: "Histórico",
        body: (
          <>
            Cada SWOT gerado fica salvo com data e custo da chamada. Limite de 1
            geração por concorrente a cada 24h.
          </>
        ),
      },
      {
        title: "Visão consolidada",
        body: (
          <>
            Em <Link to="/swot">/swot</Link> você vê todos os SWOTs gerados em
            um só lugar.
          </>
        ),
      },
    ],
  },
  {
    id: "screenshots",
    icon: BookOpen,
    title: "Histórico de Screenshots",
    summary: "Compare visualmente como o site do concorrente evoluiu.",
    steps: [
      {
        title: "Acessar",
        body: (
          <>
            Detalhe do concorrente → aba <strong>Screenshots</strong>.
          </>
        ),
      },
      {
        title: "Galeria cronológica",
        body: (
          <>
            Grid com os screenshots, do mais recente ao mais antigo. Click em
            qualquer imagem abre o lightbox.
          </>
        ),
      },
      {
        title: "Comparar antes/depois",
        body: (
          <>
            Selecione duas datas (A e B) e use o slider para revelar a imagem B
            sobre a imagem A — ótimo para identificar mudanças visuais sutis.
          </>
        ),
      },
    ],
  },
  {
    id: "settings-llm",
    icon: Settings,
    title: "Configurações — Conta & LLM",
    summary:
      "Escolha o provider de IA, modelos e gerencie suas chaves (BYOK).",
    steps: [
      {
        title: "Acessar",
        body: (
          <>
            Menu lateral → <Link to="/settings">Configurações</Link> → aba{" "}
            <strong>Conta · LLM</strong>.
          </>
        ),
      },
      {
        title: "Escolher provider",
        body: (
          <>
            4 opções: <strong>Lovable AI</strong> (default, sem chave),{" "}
            <strong>Anthropic</strong>, <strong>OpenAI</strong> e{" "}
            <strong>Google Gemini</strong> (estes 3 exigem BYOK).
          </>
        ),
      },
      {
        title: "Selecionar modelos",
        body: (
          <>
            Cada provider expõe vários modelos. Você pode escolher um modelo
            diferente para cada caso de uso (classificação rápida vs SWOT
            premium).
          </>
        ),
      },
      {
        title: "Adicionar sua chave (BYOK)",
        body: (
          <>
            Cole a chave no campo do provider. Validamos com uma chamada teste
            antes de salvar. A chave é <strong>criptografada</strong> e nunca
            volta ao browser — apenas o &ldquo;hint&rdquo; (
            <code>sk-...abcd</code>) é exibido.
          </>
        ),
      },
      {
        title: "Remover chave",
        body: (
          <>
            Clique no ícone de lixeira ao lado da chave. Após remover, o sistema
            volta automaticamente para Lovable AI como fallback.
          </>
        ),
      },
    ],
  },
  {
    id: "settings-integrations",
    icon: Plug,
    title: "Configurações — Integrações de Scraping",
    summary: "Conecte Firecrawl, ScrapFly e Similarweb (BYOK).",
    steps: [
      {
        title: "Acessar",
        body: (
          <>
            <Link to="/settings/integrations">
              Configurações → Integrações
            </Link>
            .
          </>
        ),
      },
      {
        title: "Como obter cada chave",
        body: (
          <>
            Cada card tem o botão <strong>Como obter</strong> que abre um
            painel lateral com o passo-a-passo no painel de cada provedor.
          </>
        ),
      },
      {
        title: "Conectar via Lovable",
        body: (
          <>
            Para Firecrawl você pode usar a opção{" "}
            <strong>Conectar via Lovable</strong>: ela copia uma mensagem para
            sua área de transferência — basta colá-la no chat do editor Lovable
            que o conector nativo abre automaticamente.
          </>
        ),
      },
      {
        title: "Diferença vs Contas LLM",
        body: (
          <>
            <strong>Contas LLM</strong> = modelos de IA (texto/raciocínio).{" "}
            <strong>Integrações</strong> = serviços externos de coleta de dados
            (scraping, screenshots, métricas).
          </>
        ),
      },
    ],
  },
];

function HelpPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const alertsQ = useAlerts();
  const [openId, setOpenId] = useState<string | null>("getting-started");

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  return (
    <>
      <AppTopbar
        title="Ajuda"
        subtitle="Guias passo-a-passo · Userguides"
        alertsCount={alertsQ.data?.length ?? 0}
        trailing={
          authed ? (
            <UserMenu
              email={authed.email}
              fullName={authed.fullName}
              onLogout={handleLogout}
            />
          ) : null
        }
      />
      <div className="ic-content">
        <div
          className="ic-insight"
          style={{ marginBottom: 16 }}
        >
          <div className="ic-insight-mark">
            <Lightbulb size={14} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="ic-insight-title" style={{ marginBottom: 4 }}>
              Central de Ajuda
            </div>
            <div className="ic-insight-body">
              Guias completos para cada funcionalidade do Análise de
              Concorrentes. Clique em qualquer guia para expandir o passo-a-
              passo. Se algo não estiver claro, fale com a gente.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {GUIDES.map((g) => {
            const Icon = g.icon;
            const isOpen = openId === g.id;
            return (
              <div
                key={g.id}
                style={{
                  background: "var(--via-color-bg-surface, #fff)",
                  border: "1px solid var(--via-navy-15)",
                  borderRadius: 12,
                  boxShadow: isOpen ? "var(--via-shadow-raised)" : "none",
                  transition: "box-shadow 120ms",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : g.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 18px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "var(--via-bg-2, #f5f7fb)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--via-blue)",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--via-navy)",
                        marginBottom: 2,
                      }}
                    >
                      {g.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--via-color-text-muted)",
                      }}
                    >
                      {g.summary}
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    strokeWidth={2}
                    style={{
                      color: "var(--via-color-text-muted)",
                      transform: isOpen ? "rotate(90deg)" : "none",
                      transition: "transform 120ms",
                      flexShrink: 0,
                    }}
                  />
                </button>

                {isOpen && (
                  <div
                    style={{
                      padding: "4px 18px 20px 68px",
                      borderTop: "1px solid var(--via-navy-15)",
                    }}
                  >
                    <ol
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: "12px 0 0 0",
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                      }}
                    >
                      {g.steps.map((s, idx) => (
                        <li key={idx}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "var(--via-navy)",
                              marginBottom: 4,
                            }}
                          >
                            {s.title}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              lineHeight: 1.55,
                              color: "var(--via-color-text)",
                            }}
                          >
                            {s.body}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 10,
            background: "var(--via-bg-2, #f5f7fb)",
            border: "1px dashed var(--via-navy-15)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
            color: "var(--via-color-text-muted)",
          }}
        >
          <HelpCircle size={16} strokeWidth={1.75} />
          <span>
            Não encontrou o que procurava? Use a busca no topo ou entre em
            contato com o suporte da Viver de IA.
          </span>
        </div>
      </div>
    </>
  );
}
