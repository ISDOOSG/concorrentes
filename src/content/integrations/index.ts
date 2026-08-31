import { firecrawl } from "./firecrawl";
import { scrapecreators } from "./scrapecreators";
import type { IntegrationContent } from "./types";

export const INTEGRATIONS: Record<
  "firecrawl" | "scrapecreators",
  IntegrationContent
> = {
  firecrawl,
  scrapecreators,
};

export const INTEGRATION_LIST: IntegrationContent[] = [firecrawl, scrapecreators];

export type { IntegrationContent } from "./types";
