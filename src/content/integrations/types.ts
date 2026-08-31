import type { ReactNode } from "react";

export type IntegrationContent = {
  id: "firecrawl" | "scrapecreators";
  name: string;
  tagline: string;
  emoji: string;
  optional: boolean;
  hasLovableConnector: boolean;
  keyPrefix?: string; // e.g. "fc-", "scp-live-"
  signupUrl: string;
  apiKeyUrl: string;
  pricingNote: string;
  content: ReactNode;
};
