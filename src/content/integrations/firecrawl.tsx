import { ExternalLink } from "lucide-react";
import type { IntegrationContent } from "./types";
import * as s from "./styles";

export const firecrawl: IntegrationContent = {
  id: "firecrawl",
  name: "Firecrawl",
  tagline: "Scraping principal — páginas dinâmicas, JS, anti-bot.",
  emoji: "🔥",
  optional: false,
  hasLovableConnector: true,
  keyPrefix: "fc-",
  signupUrl: "https://www.firecrawl.dev/signup",
  apiKeyUrl: "https://www.firecrawl.dev/app/api-keys",
  pricingNote: "Plano grátis: 500 créditos/mês.",
  content: (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section>
        <h3 style={s.heading}>O que é o Firecrawl?</h3>
        <p style={s.paragraph}>
          API de scraping com renderização JavaScript, bypass de anti-bot e
          extração estruturada. É o provedor <strong>principal</strong> que
          usamos para crawlear seus concorrentes.
        </p>
      </section>

      <section style={s.optionBox("var(--via-blue)")}>
        <div style={s.optionHeader}>
          <span style={s.optionBadge("var(--via-blue)")}>Recomendado</span>
          <h3 style={s.optionTitle}>Opção A — Conector Lovable (1 clique)</h3>
        </div>
        <ol style={s.list}>
          <li>
            Clique no botão <strong>"Conectar via Lovable"</strong> no card.
          </li>
          <li>
            Faça login na sua conta Firecrawl (ou crie uma em{" "}
            <a
              href="https://www.firecrawl.dev/signup"
              target="_blank"
              rel="noreferrer"
              style={s.link}
            >
              firecrawl.dev <ExternalLink size={11} />
            </a>
            ).
          </li>
          <li>
            Autorize a integração — pronto. Você não precisa copiar nem colar
            nenhuma chave.
          </li>
        </ol>
      </section>

      <section style={s.optionBox()}>
        <div style={s.optionHeader}>
          <h3 style={s.optionTitle}>Opção B — Colar API key manualmente</h3>
        </div>
        <ol style={s.list}>
          <li>
            Acesse{" "}
            <a
              href="https://www.firecrawl.dev/app/api-keys"
              target="_blank"
              rel="noreferrer"
              style={s.link}
            >
              firecrawl.dev/app/api-keys <ExternalLink size={11} />
            </a>{" "}
            (faça login se necessário).
          </li>
          <li>
            Clique em <strong>"Create API Key"</strong>, dê um nome (ex:
            "Análise de Concorrentes") e copie a chave gerada — começa com{" "}
            <code style={s.code}>fc-</code>.
          </li>
          <li>Cole a chave no campo do card e clique em "Testar e salvar".</li>
        </ol>
      </section>

      <section style={s.pricingBox}>
        <strong>💰 Custos:</strong> Plano grátis tem{" "}
        <strong>500 créditos/mês</strong> (≈ 500 páginas). Plano Hobby a partir
        de US$ 16/mês.
        <br />
        <br />
        <strong>🎁 Cupom Lovable:</strong> use{" "}
        <code style={s.code}>LOVABLE50</code> para{" "}
        <strong>50% de desconto</strong> nos primeiros 3 meses do plano pago.
      </section>
    </div>
  ),
};
