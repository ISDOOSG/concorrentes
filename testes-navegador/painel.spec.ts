/**
 * Abre o site de verdade, faz login e visita cada tela.
 *
 * POR QUE ISTO EXISTE: em 03/09/2026 a suíte da API estava verde, o
 * `npm run build` passava e as 12 rotas respondiam 200 — e isso não provava
 * nada sobre as telas. O guard de sessão vive no componente, no cliente, e
 * o SSR devolve só o carregador: um 200 dizia apenas que o servidor
 * respondeu, não que a página montou.
 *
 * O que este arquivo afirma é o que só um navegador vê: que a tela monta,
 * que o conteúdo aparece e que nada estourou no console.
 */
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const EMAIL = "playwright-teste@imagohub.com.br";
const SENHA = process.env.SENHA_TESTE ?? "";

/** Ruído conhecido que não indica defeito do produto. */
const RUIDO = [
  /favicon/i,
  /Failed to load resource.*40[34]/i,
  /Download the React DevTools/i,
];

function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const texto = m.text();
    if (RUIDO.some((r) => r.test(texto))) return;
    erros.push(`console: ${texto}`);
  });
  return erros;
}

async function entrar(page: Page) {
  await page.goto("/login");
  // A tela de login e a de cadastro coexistem no DOM (cartao que vira), e
  // as duas tem campo "E-mail". Por isso o formulario e escopado pelo seu
  // proprio botao de envio, em vez de buscar o campo na pagina inteira.
  const formulario = page.locator("form").filter({
    has: page.getByRole("button", { name: "Entrar", exact: true }),
  });
  await formulario.getByPlaceholder("E-mail").fill(EMAIL);
  await formulario.getByPlaceholder("Senha").fill(SENHA);
  await formulario.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.beforeAll(() => {
  if (!SENHA) {
    throw new Error(
      "SENHA_TESTE não veio no ambiente. Use `npm run test:navegador`, " +
        "que cria o usuário efêmero e o apaga no fim.",
    );
  }
});

test("o login funciona e leva ao dashboard", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  expect(erros).toEqual([]);
});

const TELAS: Array<{ rota: string; titulo: string }> = [
  { rota: "/dashboard", titulo: "Dashboard" },
  { rota: "/competitors", titulo: "Concorrentes" },
  { rota: "/compare", titulo: "Comparar" },
  { rota: "/alerts", titulo: "Alertas" },
  { rota: "/swot", titulo: "SWOT" },
  { rota: "/onboard", titulo: "" },
  { rota: "/settings", titulo: "Configurações" },
  { rota: "/settings/integrations", titulo: "Configurações" },
  { rota: "/settings/equipe", titulo: "Configurações" },
  { rota: "/help", titulo: "" },
];

test("toda tela do menu monta, sem erro no console", async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page);

  for (const { rota, titulo } of TELAS) {
    await page.goto(rota);
    // A barra lateral é do layout autenticado: se ela apareceu, o layout
    // montou e o guard de sessão deixou passar.
    await expect(page.locator("aside.ic-sidebar")).toBeVisible();
    if (titulo) {
      await expect(page.locator(".ic-topbar-title")).toContainText(titulo);
    }
    // Nenhuma tela pode terminar mostrando só o carregador.
    await expect(page.locator("body")).not.toHaveText(/^\s*$/);
  }
  expect(erros, `erros nas telas: ${erros.join(" | ")}`).toEqual([]);
});

test("o menu leva às oito telas, e Ajuda não fica pelo caminho", async ({ page }) => {
  // A Ajuda era o único destino ausente do mapa de navegação morto que
  // vivia no dashboard.
  await entrar(page);
  const menu = page.locator("nav.ic-nav");
  for (const rotulo of [
    "Concorrentes",
    "Comparar",
    "Alertas",
    "Análise SWOT",
    "Adicionar concorrente",
    "Configurações",
    "Ajuda",
    "Dashboard",
  ]) {
    await menu.getByText(rotulo, { exact: true }).click();
    await expect(page.locator("aside.ic-sidebar")).toBeVisible();
  }
});

test("a busca do topo aparece onde filtra, e some onde não filtra", async ({ page }) => {
  await entrar(page);

  await page.goto("/competitors");
  await expect(
    page.getByPlaceholder("Buscar por nome ou domínio…"),
  ).toBeVisible();

  await page.goto("/help");
  await expect(page.locator(".ic-search input")).toHaveCount(0);
});

test("o sino leva aos alertas", async ({ page }) => {
  await entrar(page);
  await page.goto("/dashboard");
  await page.getByLabel("Alertas").click();
  await expect(page.locator(".ic-topbar-title")).toContainText("Alertas");
});

test("as integrações dizem que a chave do projeto está ativa", async ({ page }) => {
  // A tela dizia "não configurado" com Firecrawl e ScrapeCreators
  // funcionando pela chave do `.env`.
  await entrar(page);
  await page.goto("/settings/integrations");
  await expect(page.getByText(/chave do projeto/i).first()).toBeVisible();
});

test("o disparo de crawl da lista tem texto, não só ícone", async ({ page }) => {
  // `title` não é rótulo: o balão demora cerca de um segundo e não existe
  // em toque. Era o único disparo de crawl da lista, e ninguém o achava.
  //
  // Este teste NÃO cadastra concorrente de propósito: desde 03/09 o
  // cadastro dispara o primeiro crawl, e cada execução da suíte custaria
  // um crédito de Firecrawl. Quem cobre o cadastro é o pytest, com dublo.
  await entrar(page);
  await page.goto("/competitors");
  const linhas = page.getByRole("button", { name: "Crawlear agora" });
  if ((await linhas.count()) === 0) {
    test.skip(true, "a conta de teste não tem concorrente cadastrado");
  }
  await expect(linhas.first()).toBeVisible();
});
