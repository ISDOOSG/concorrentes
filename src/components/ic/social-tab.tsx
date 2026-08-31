import { useState } from "react";
import { toast } from "sonner";
import {
  Instagram,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Heart,
  MessageCircle,
  Eye,
  CheckCircle2,
  Search,
} from "lucide-react";

import {
  useInstagramHandles,
  useLatestSocialSnapshot,
  useFetchSocial,
  useAnalyzeSocial,
  useSocialAnalysis,
  useSetInstagramHandle,
} from "@/lib/data/hooks/use-social";
import { toastDataError } from "@/lib/data/error-toast";
import type { Competitor } from "@/lib/ic-mock";
import type { SocialPost } from "@/lib/social/types";

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "agora há pouco";
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function normalizeHandleInput(raw: string): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/^@/, "");
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    if (u.hostname.includes("instagram.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (!parts.length) return null;
      v = parts[0];
    }
  } catch {/* not url */}
  v = v.split("?")[0].replace(/\/+$/, "").toLowerCase();
  if (!/^[\w.\-]{1,40}$/.test(v)) return null;
  const block = ["p", "reel", "reels", "explore", "accounts", "stories", "tv"];
  if (block.includes(v)) return null;
  return v;
}

export function SocialTab({ comp }: { comp: Competitor }) {
  const handlesQ = useInstagramHandles(comp.id);
  const snapshotQ = useLatestSocialSnapshot(comp.id);
  const analysisQ = useSocialAnalysis(comp.id);
  const fetchMut = useFetchSocial();
  const analyzeMut = useAnalyzeSocial();
  const handleMut = useSetInstagramHandle();

  const [handleInput, setHandleInput] = useState("");

  const handleData = handlesQ.data;
  const snap = snapshotQ.data;
  const analysis = analysisQ.data;
  const activeHandle = handleData?.handle ?? handleData?.suggestion ?? snap?.handle ?? null;

  const onSaveHandle = async () => {
    const norm = normalizeHandleInput(handleInput);
    if (!norm) {
      toast.error("Handle inválido. Use @nome, URL do perfil ou só o nome.");
      return;
    }
    try {
      await handleMut.mutateAsync({ competitorId: comp.id, handle: norm });
      toast.success(`Handle @${norm} salvo`);
      setHandleInput("");
    } catch (err) {
      toastDataError(err, "Falha ao salvar handle");
    }
  };

  const onFetch = async (autoDetect = false) => {
    if (!autoDetect && !activeHandle) {
      toast.info("Informe o @ do Instagram ou clique em 'Detectar pelo site'.");
      return;
    }
    const res = await fetchMut.mutateAsync({ competitorId: comp.id });
    if (res.ok) {
      if (res.throttled) {
        toast.info("Snapshot recente em cache (<1h). Aguarde para atualizar.");
      } else {
        toast.success(
          `Perfil @${res.handle} carregado · ${res.posts_returned} posts${
            res.followers_delta != null
              ? ` · Δ ${res.followers_delta > 0 ? "+" : ""}${res.followers_delta} followers`
              : ""
          }`,
        );
      }
    } else {
      toast.error(res.error);
    }
  };

  const onAnalyze = async () => {
    if (!snap) {
      toast.info("Faça uma busca de perfil antes de analisar.");
      return;
    }
    const res = await analyzeMut.mutateAsync({ competitorId: comp.id });
    if (res.ok) toast.success("Análise gerada");
    else toast.error(res.error);
  };

  // ----- Empty state: no handle -----
  if (!activeHandle && !snapshotQ.isLoading && !handlesQ.isLoading) {
    return (
      <div style={{ padding: 8 }}>
        <div
          style={{
            background: "var(--via-color-bg-surface)",
            border: "1px solid var(--via-color-border-subtle)",
            borderRadius: 14,
            padding: 28,
            textAlign: "center",
          }}
        >
          <Instagram size={40} strokeWidth={1.5} style={{ color: "#E1306C", marginBottom: 12 }} />
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--via-navy)", marginBottom: 6 }}>
            Vincule o Instagram do concorrente
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "var(--via-color-text-muted)",
              marginBottom: 20,
              maxWidth: 480,
              margin: "0 auto 20px",
            }}
          >
            Cole o <code>@</code>, a URL do perfil, ou clique em "Detectar pelo site" pra extrairmos via Firecrawl.
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              maxWidth: 460,
              margin: "0 auto",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <input
              type="text"
              className="via-input"
              placeholder="@viverdeia ou instagram.com/viverdeia"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              style={{ flex: "1 1 240px", minWidth: 200 }}
            />
            <button
              type="button"
              className="ic-btn ic-btn-blue"
              onClick={onSaveHandle}
              disabled={handleMut.isPending}
            >
              Salvar
            </button>
            <button
              type="button"
              className="ic-btn ic-btn-secondary"
              onClick={() => onFetch(true)}
              disabled={fetchMut.isPending}
              title="Tenta extrair o @ direto do site do concorrente via Firecrawl"
            >
              <Search size={14} />
              {fetchMut.isPending ? "Detectando…" : "Detectar pelo site"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 8 }}>
      {/* Header */}
      <div
        style={{
          background: "var(--via-color-bg-surface)",
          border: "1px solid var(--via-color-border-subtle)",
          borderRadius: 14,
          padding: 20,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {snap?.profilePicUrl ? (
          <img
            src={snap.profilePicUrl}
            alt={`@${snap.handle}`}
            style={{ width: 64, height: 64, borderRadius: 32, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "linear-gradient(135deg,#833AB4,#FD1D1D,#FCB045)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Instagram size={28} color="white" strokeWidth={2} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <a
              href={`https://www.instagram.com/${activeHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--via-navy)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              @{activeHandle}
              <ExternalLink size={14} />
            </a>
            {snap?.isVerified && <CheckCircle2 size={16} style={{ color: "#1DA1F2" }} />}
          </div>
          <div style={{ fontSize: 12, color: "var(--via-color-text-muted)" }}>
            {snap?.bio
              ? snap.bio.slice(0, 120) + (snap.bio.length > 120 ? "…" : "")
              : handleData?.lastFetchedAt
                ? `Última coleta: ${relativeDate(handleData.lastFetchedAt)}`
                : "Sem dados ainda"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="ic-btn ic-btn-blue"
            onClick={() => onFetch()}
            disabled={fetchMut.isPending}
          >
            <RefreshCw size={14} className={fetchMut.isPending ? "animate-spin" : ""} />
            {fetchMut.isPending ? "Buscando…" : "Buscar perfil (1 cr.)"}
          </button>
          <button
            type="button"
            className="ic-btn ic-btn-secondary"
            onClick={onAnalyze}
            disabled={analyzeMut.isPending || !snap}
          >
            <Sparkles size={14} />
            {analyzeMut.isPending ? "Analisando…" : "Analisar com IA"}
          </button>
        </div>
      </div>

      {/* Metrics */}
      {snap && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))",
            gap: 12,
          }}
        >
          <MetricCard label="Seguidores" value={formatNumber(snap.followers)} />
          <MetricCard label="Seguindo" value={formatNumber(snap.following)} />
          <MetricCard label="Posts no perfil" value={formatNumber(snap.postsCount)} />
          <MetricCard
            label="Posts coletados"
            value={String(snap.recentPosts.length)}
            hint={snap.recentPosts.length > 0 ? `Últimos ${snap.recentPosts.length}` : undefined}
          />
        </div>
      )}

      {/* Posts grid */}
      {snap && snap.recentPosts.length > 0 && (
        <div
          style={{
            background: "var(--via-color-bg-surface)",
            border: "1px solid var(--via-color-border-subtle)",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--via-navy)", marginBottom: 12 }}>
            Posts recentes
          </h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))",
              gap: 12,
            }}
          >
            {snap.recentPosts.map((p) => (
              <PostCard key={p.shortcode} post={p} />
            ))}
          </div>
        </div>
      )}

      {/* AI Analysis */}
      {analysis && (
        <div
          style={{
            background: "var(--via-color-bg-surface)",
            border: "1px solid var(--via-color-border-subtle)",
            borderRadius: 14,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Sparkles size={16} style={{ color: "var(--via-blue)" }} />
            <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--via-navy)", margin: 0 }}>
              Análise IA · {new Date(analysis.analyzedAt).toLocaleDateString("pt-BR")}
            </h4>
          </div>
          {analysis.summary && (
            <p style={{ fontSize: 13, color: "var(--via-color-text-body)", marginBottom: 16, lineHeight: 1.5 }}>
              {analysis.summary}
            </p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <MetricCard
              label="Cadência"
              value={`${analysis.cadence.posts_per_week.toFixed(1)}/sem`}
              hint={analysis.cadence.best_weekday}
            />
            <MetricCard
              label="Engajamento"
              value={`${analysis.engagement.engagement_rate_pct.toFixed(2)}%`}
              hint={`~${formatNumber(analysis.engagement.avg_likes)} likes/post`}
            />
            <MetricCard
              label="Mix de formatos"
              value={`${analysis.formatMix.reel_pct}% Reels`}
              hint={`${analysis.formatMix.image_pct}% foto · ${analysis.formatMix.carousel_pct}% carrossel`}
            />
          </div>
          {analysis.themes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--via-color-text-muted)",
                  marginBottom: 6,
                }}
              >
                Temas dominantes
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {analysis.themes.map((t) => (
                  <span
                    key={t.label}
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(10,79,149,0.08)",
                      color: "var(--via-navy)",
                      fontWeight: 600,
                    }}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {analysis.insights.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--via-color-text-muted)",
                  marginBottom: 6,
                }}
              >
                Insights acionáveis
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {analysis.insights.map((ins, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--via-color-text-body)", marginBottom: 4, lineHeight: 1.5 }}>
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {snap && !analysis && (
        <div
          style={{
            background: "rgba(10,79,149,0.04)",
            border: "1px dashed rgba(10,79,149,0.3)",
            borderRadius: 10,
            padding: 14,
            fontSize: 12,
            color: "var(--via-color-text-muted)",
            textAlign: "center",
          }}
        >
          Clique em "Analisar com IA" pra gerar cadência, mix de formatos, temas e insights acionáveis.
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        background: "var(--via-color-bg-surface)",
        border: "1px solid var(--via-color-border-subtle)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--via-color-text-muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--via-navy)", lineHeight: 1.1 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--via-color-text-muted)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  const typeBadge =
    post.type === "video" ? "Reel" : post.type === "carousel" ? "Carrossel" : "Foto";
  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        background: "var(--via-bg-2)",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--via-color-border-subtle)",
        transition: "transform 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <div style={{ position: "relative", paddingTop: "100%", background: "#0c1f33" }}>
        {post.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnail_url}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            loading="lazy"
          />
        )}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 4,
            background: "rgba(0,0,0,0.6)",
            color: "white",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {typeBadge}
        </span>
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            fontSize: 12,
            color: "var(--via-color-text-body)",
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: 34,
          }}
        >
          {post.caption || <span style={{ color: "var(--via-color-text-muted)" }}>(sem legenda)</span>}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            fontSize: 11,
            color: "var(--via-color-text-muted)",
            alignItems: "center",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <Heart size={11} />
            {formatNumber(post.like_count)}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <MessageCircle size={11} />
            {formatNumber(post.comment_count)}
          </span>
          {post.video_view_count != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <Eye size={11} />
              {formatNumber(post.video_view_count)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
