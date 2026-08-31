// Entry global do TanStack Start. Sem este arquivo o framework usa um
// startInstance vazio e NENHUM middleware global roda — o browser deixa de
// anexar o bearer token nos serverFn RPCs e todos respondem 401.
import { createStart } from "@tanstack/react-start";

import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
