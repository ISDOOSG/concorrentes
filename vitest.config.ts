import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Configuracao propria da suite de tela. NAO reaproveita o vite.config.ts:
// aquele carrega o plugin do TanStack Start, que quer gerar rotas e subir
// servidor SSR -- nada disso faz sentido para montar um componente em jsdom.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/testes/preparo.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
  },
});
