import { Sparkles, RefreshCw, Zap, AlertTriangle, Target, ListChecks } from "lucide-react";
import { toast } from "sonner";

import {
  useSeoAnalysis,
  useTriggerSeoAnalysis,
} from "@/lib/data/hooks/use-seo-analysis";
import { AIBadge } from "./ai-badge";
import type { Competitor } from "@/lib/ic-mock";

const INTENT_COLORS: Record<string, string> = {
  informacional: "var(--via-blue)",
  navegacional: "var(--via-util-3)",
  transacional: "var(--via-success)",
  comercial: "var(--via-util-1)",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ListBlock({
  icon,
  title,
  items,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  color: string;
}) {
  if (!items?.length) return null;
  return (
    <div
      style={{
        border: "1px solid var(--via-navy-15)",
        borderRadius: 10,
        padding: 14,
        background: "var(--via-color-bg-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: `color-mix(in oklab, ${color} 12%, transparent)`,
            color,
          }}
        >
          {icon}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.12em",
            color: "var(--via-navy)",
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 13,
          color: "var(--via-color-text-default)",
          lineHeight: 1.5,
        }}
      >
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export function SeoAiAnalysis({ comp }: { comp: Competitor }) {
  const q = useSeoAnalysis(comp.id);
  const mut = useTriggerSeoAnalysis();

  const analysis = q.data;
  const loading = q.isLoading;
  const running = mut.isPending;

  const onAnalyze = () => {
    mut.mutate(comp.id, {
      onSuccess: () => toast.success(`Análise de SEO gerada para ${comp.name}`),
      onError: (err) => {
        const e = err as Error & { status?: number };
        toast.error(e.message || "Falha ao gerar análise de SEO");
      },
    });
  };

  return (
    <div
      style={{
        border: "1px solid var(--via-navy-15)",
        borderRadius: 14,
        padding: 18,
        marginBottom: 24,
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--via-blue) 4%, transparent), transparent 60%)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: analysis ? 16 : 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--via-blue-light)",
            color: "var(--via-blue)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Sparkles size={20} strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "var(--via-navy)",
                margin: 0,
              }}
            >
              Análise de SEO por IA
            </h3>
            {analysis && <AIBadge>{analysis.model}</AIBadge>}
            {analysis?.score != null && (
              <span
                className="ic-pill"
                style={{
                  background:
                    analysis.score >= 75
                      ? "color-mix(in oklab, var(--via-success) 14%, transparent)"
                      : analysis.score >= 50
                        ? "color-mix(in oklab, var(--via-warning) 14%, transparent)"
                        : "color-mix(in oklab, var(--via-danger) 14%, transparent)",
                  color:
                    analysis.score >= 75
                      ? "var(--via-success)"
                      : analysis.score >= 50
                        ? "var(--via-warning)"
                        : "var(--via-danger)",
                  fontWeight: 900,
                }}
              >
                Score {analysis.score}/100
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--via-color-text-muted)",
              marginTop: 4,
            }}
          >
            {analysis
              ? `Analisado em ${fmtDate(analysis.analyzed_at)} a partir do último crawl`
              : "Gere uma análise SEO completa do site do concorrente usando IA — pontos fortes, fracos, oportunidades e keywords-alvo."}
          </div>
        </div>
        <button
          type="button"
          className="ic-btn ic-btn-blue"
          onClick={onAnalyze}
          disabled={running || loading}
          title={
            running
              ? "Analisando…"
              : analysis
                ? "Gerar nova análise"
                : "Analisar com IA"
          }
        >
          <RefreshCw
            size={12}
            style={{
              animation: running ? "ic-spin 1s linear infinite" : undefined,
            }}
          />
          {running
            ? "Analisando…"
            : analysis
              ? "Re-analisar"
              : "Analisar com IA"}
        </button>
      </div>

      {!analysis && !loading && (
        <div
          style={{
            fontSize: 12,
            color: "var(--via-color-text-muted)",
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px dashed var(--via-navy-15)",
          }}
        >
          Requer um snapshot recente do site (rode "Sincronizar crawl" no
          topo, se ainda não houver). A IA analisa o markdown coletado e
          devolve insights estruturados.
        </div>
      )}

      {analysis && (
        <>
          {analysis.summary && (
            <div
              style={{
                fontSize: 14,
                color: "var(--via-color-text-default)",
                lineHeight: 1.55,
                marginBottom: 16,
                padding: "12px 14px",
                background: "var(--via-color-bg-surface)",
                border: "1px solid var(--via-navy-15)",
                borderRadius: 10,
              }}
            >
              {analysis.summary}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <ListBlock
              icon={<Zap size={14} />}
              title="Pontos fortes"
              items={analysis.strengths}
              color="var(--via-success)"
            />
            <ListBlock
              icon={<AlertTriangle size={14} />}
              title="Pontos fracos"
              items={analysis.weaknesses}
              color="var(--via-danger)"
            />
            <ListBlock
              icon={<Target size={14} />}
              title="Oportunidades pra você"
              items={analysis.opportunities}
              color="var(--via-blue)"
            />
            <ListBlock
              icon={<ListChecks size={14} />}
              title="Recomendações"
              items={analysis.recommendations}
              color="var(--via-util-1)"
            />
          </div>

          {analysis.target_keywords?.length > 0 && (
            <div
              style={{
                border: "1px solid var(--via-navy-15)",
                borderRadius: 10,
                padding: 14,
                background: "var(--via-color-bg-surface)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  color: "var(--via-navy)",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Keywords-alvo detectadas
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analysis.target_keywords.map((k, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom:
                        i < analysis.target_keywords.length - 1
                          ? "1px solid var(--via-navy-15)"
                          : undefined,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color:
                          INTENT_COLORS[k.intent] ?? "var(--via-color-text-muted)",
                        background: `color-mix(in oklab, ${
                          INTENT_COLORS[k.intent] ?? "var(--via-navy)"
                        } 12%, transparent)`,
                        padding: "3px 8px",
                        borderRadius: 6,
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {k.intent}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--via-navy)",
                        }}
                      >
                        {k.keyword}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--via-color-text-muted)",
                          marginTop: 2,
                          lineHeight: 1.45,
                        }}
                      >
                        {k.rationale}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
