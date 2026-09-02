// Configuração de build própria — substitui `@lovable.dev/vite-tanstack-config`.
//
// O pacote da Lovable montava estes mesmos plugins e mais dois que não servem
// aqui: o `componentTagger` (só no editor deles) e o alvo Cloudflare. Era o
// alvo que criava a armadilha: `defaultPreset: "cloudflare-module"` está
// fixo no código dele, e a lista de presets aceitos tem só os dois deles —
// por isso `npm run build` gerava um Worker que exporta handler em vez de
// subir servidor, e o serviço saía com código 0 em ~360ms com o nginx batendo
// em porta vazia. Aconteceu de verdade em 02/09.
//
// Aqui o preset é `node-server`, declarado. `npm run build` já sai certo, e o
// `build:vps` continua existindo só por compatibilidade com quem decorou.
//
// A injeção de `VITE_*` no bundle, que o pacote deles fazia, é nativa do Vite
// — não precisa de plugin.
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: "node-server" }),
    viteReact(),
  ],
});
