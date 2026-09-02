// Entry global do TanStack Start.
//
// Antes registrava `attachSupabaseAuth` como functionMiddleware global,
// porque as server functions de SEO, crawl e ads validavam sessao contra o
// Auth da Supabase. Essas server functions foram removidas -- o front fala
// direto com a API propria, que autentica pelo Bearer do api-client. Sem
// server function, nao ha middleware global a registrar.
import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({}));
