import { ExternalLink } from "lucide-react";
import type { IntegrationContent } from "./types";
import * as s from "./styles";

export const scrapecreators: IntegrationContent = {
  id: "scrapecreators",
  name: "ScrapeCreators",
  tagline: "Anúncios ativos no Meta (Facebook + Instagram) e Google Ads.",
  emoji: "📣",
  optional: true,
  hasLovableConnector: false,
  signupUrl: "https://scrapecreators.com",
  apiKeyUrl: "https://scrapecreators.com/dashboard",
  pricingNote: "Plano grátis: 100 créditos. 1 crédito = 1 ad consultado.",
  content: (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section>
        <h3 style={s.heading}>O que é o ScrapeCreators?</h3>
        <p style={s.paragraph}>
          API que acessa as <strong>bibliotecas de anúncios oficiais</strong> do
          Meta (Facebook Ad Library) e do Google (Google Ads Transparency
          Center). Com ela conseguimos listar todos os anúncios ativos de um
          concorrente no Meta e no Google, com{" "}
          <strong>copy, criativo, CTA, segmentação e gasto estimado</strong>.
        </p>
      </section>

      <section style={s.optionBox("var(--via-blue)")}>
        <div style={s.optionHeader}>
          <h3 style={s.optionTitle}>Como obter sua chave</h3>
        </div>
        <ol style={s.list}>
          <li>
            Crie uma conta em{" "}
            <a
              href="https://scrapecreators.com"
              target="_blank"
              rel="noreferrer"
              style={s.link}
            >
              scrapecreators.com <ExternalLink size={11} />
            </a>{" "}
            (plano grátis com 100 créditos, sem cartão).
          </li>
          <li>
            No dashboard, copie sua <strong>API Key</strong> (header{" "}
            <code style={s.code}>x-api-key</code>).
          </li>
          <li>Cole a chave no campo do card e clique em "Testar e salvar".</li>
        </ol>
      </section>

      <section style={s.optionBox()}>
        <div style={s.optionHeader}>
          <h3 style={s.optionTitle}>Como vincular um concorrente</h3>
        </div>
        <p style={s.paragraph}>
          Depois de configurar a chave, ao cadastrar (ou editar) um concorrente
          você pode informar:
        </p>
        <ol style={s.list}>
          <li>
            <strong>URL da Facebook Page</strong> (ex:{" "}
            <code style={s.code}>https://facebook.com/rdstation</code>)
          </li>
          <li>
            <strong>Google Advertiser ID</strong> — encontre na URL da Google
            Ads Transparency:{" "}
            <code style={s.code}>
              https://adstransparency.google.com/advertiser/<em>AR123…</em>
            </code>
          </li>
        </ol>
        <p style={s.paragraph}>
          Você pode informar só Meta, só Google, ou ambos. Sem nenhum dos dois,
          o concorrente segue sendo monitorado para mudanças no site (via
          Firecrawl), mas a aba "Anúncios" fica vazia.
        </p>
      </section>

      <section style={s.pricingBox}>
        <strong>💰 Custos:</strong> Plano grátis tem{" "}
        <strong>100 créditos</strong> (1 crédito = 1 ad consultado). Cada ad
        ativo do concorrente consome 1 crédito por refresh — então um
        concorrente com 20 ads ativos custa ~20 créditos por crawl. Planos
        pagos a partir de US$ 25/mês com 5.000 créditos.
        <br />
        <br />
        <strong>🌎 Cobertura:</strong> Meta Ad Library cobre todos os países
        com transparência política/eleitoral; Google Ads Transparency cobre
        anunciantes verificados.
      </section>
    </div>
  ),
};
