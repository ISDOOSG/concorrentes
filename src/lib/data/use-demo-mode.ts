import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DEMO_MODE_EVENT, isDemoMode, setDemoMode } from "./index";

export function useDemoMode() {
  const qc = useQueryClient();
  const [enabled, setEnabledState] = useState<boolean>(() => isDemoMode());

  useEffect(() => {
    const handler = () => setEnabledState(isDemoMode());
    window.addEventListener(DEMO_MODE_EVENT, handler);
    // Sync se outra aba/tab mudar
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(DEMO_MODE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setDemoMode(next);
    // Limpa todo o cache do TanStack Query — todos os queries refazem
    // fetch contra o provider novo (mock <-> supabase).
    qc.clear();
  }, [enabled, qc]);

  const setEnabled = useCallback(
    (value: boolean) => {
      if (value === enabled) return;
      setDemoMode(value);
      qc.clear();
    },
    [enabled, qc],
  );

  return { enabled, toggle, setEnabled };
}
