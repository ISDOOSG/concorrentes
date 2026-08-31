import type { DataProvider } from "./types";
import { mockProvider } from "./providers/mock";
import { supabaseProvider } from "./providers/supabase";

const DEMO_KEY = "ac-demo-mode";
const DEMO_EVENT = "ac:demo-mode-changed";

// Build-time override: VITE_DATA_PROVIDER=mock força mock independente do toggle.
// Útil para CI ou desenvolvimento offline.
const buildTimeForceMock =
  (import.meta.env?.VITE_DATA_PROVIDER as string | undefined)?.toLowerCase() ===
  "mock";

const buildTimeForceSupabase =
  (import.meta.env?.VITE_DATA_PROVIDER as string | undefined)?.toLowerCase() ===
  "supabase";

export function isDemoMode(): boolean {
  if (buildTimeForceMock) return true;
  if (buildTimeForceSupabase) return false;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEMO_KEY) === "true";
}

export function setDemoMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.setItem(DEMO_KEY, "true");
  } else {
    window.localStorage.removeItem(DEMO_KEY);
  }
  window.dispatchEvent(new CustomEvent(DEMO_EVENT));
}

export const DEMO_MODE_EVENT = DEMO_EVENT;

// Proxy resolves the active provider on every method call.
// Components import { data } once and always get the right backend.
export const data: DataProvider = new Proxy({} as DataProvider, {
  get(_, prop, receiver) {
    const provider = isDemoMode() ? mockProvider : supabaseProvider;
    return Reflect.get(provider, prop, receiver);
  },
});

export * from "./types";
