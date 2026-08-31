// Server functions para o status/teste das integrações de scraping
// conectadas via Lovable (FIRECRAWL_API_KEY, SCRAPECREATORS_API_KEY).
// Lê env vars no servidor — nunca expõe a chave para o cliente, só
// booleans e resultado do teste.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ScraperConnectorStatus = {
  firecrawl: boolean;
  scrapecreators: boolean;
};

export type ConnectorTestResult =
  | { ok: true; latencyMs: number }
  | { ok: false; error: string };

const providerSchema = z.object({
  provider: z.enum(["firecrawl", "scrapecreators"]),
});

type Provider = "firecrawl" | "scrapecreators";

function readKey(provider: Provider): string {
  const envName =
    provider === "firecrawl" ? "FIRECRAWL_API_KEY" : "SCRAPECREATORS_API_KEY";
  return (process.env[envName] ?? "").trim();
}

// ---- getConnectorStatus -------------------------------------------------

export const getConnectorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ScraperConnectorStatus> => {
    return {
      firecrawl: readKey("firecrawl").length >= 8,
      scrapecreators: readKey("scrapecreators").length >= 8,
    };
  });

// ---- testConnectorConnection -------------------------------------------

async function testFirecrawl(key: string): Promise<ConnectorTestResult> {
  const t = Date.now();
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        url: "https://example.com",
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });
    const latencyMs = Date.now() - t;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Firecrawl ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      };
    }
    return { ok: true, latencyMs };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Falha de rede" };
  }
}

async function testScrapeCreators(key: string): Promise<ConnectorTestResult> {
  const t = Date.now();
  try {
    // Endpoint mais barato disponível: search/companies com query simples.
    const res = await fetch(
      `https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?query=test&limit=1`,
      { headers: { "x-api-key": key } },
    );
    const latencyMs = Date.now() - t;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `ScrapeCreators ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      };
    }
    return { ok: true, latencyMs };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Falha de rede" };
  }
}

export const testConnectorConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => providerSchema.parse(input))
  .handler(async ({ data }): Promise<ConnectorTestResult> => {
    const key = readKey(data.provider);
    if (!key || key.length < 8) {
      return {
        ok: false,
        error: `Nenhuma chave ${data.provider} configurada via Lovable`,
      };
    }
    if (data.provider === "firecrawl") return testFirecrawl(key);
    return testScrapeCreators(key);
  });
