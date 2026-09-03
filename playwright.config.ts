import { defineConfig, devices } from "@playwright/test";

// Roda contra o site NO AR, nao contra um servidor de teste. E de proposito:
// o que se quer provar aqui e que a pagina monta no navegador de verdade,
// com o build que esta servindo -- exatamente o que `npm run build` verde e
// HTTP 200 no SSR nao provam, porque o guard de sessao renderiza so o
// carregador no servidor.
export default defineConfig({
  testDir: "./testes-navegador",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL:
      process.env.URL_BASE ?? "https://concorrentes.imagohub.com.br",
    trace: "retain-on-failure",
    locale: "pt-BR",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
