import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// O jsdom nao implementa matchMedia, e `useIsMobile` chama no primeiro
// render. Sem isto toda tela quebra no monte -- e por um motivo que nao tem
// nada a ver com o produto.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// `sonner` monta portal e timers que nao interessam ao teste de montagem.
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    success: () => {},
    error: () => {},
    info: () => {},
    warning: () => {},
  }),
  Toaster: () => null,
}));

afterEach(() => cleanup());
