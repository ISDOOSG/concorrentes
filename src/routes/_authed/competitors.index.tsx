import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pause,
  Play,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtTraffic, fmtDelta } from "@/lib/formatters";
import { AppTopbar } from "@/components/ic/app-topbar";
import { CompetitorFavicon } from "@/components/ic/competitor-favicon";
import { CrawlStatusBadge } from "@/components/ic/crawl-status-badge";
import { Sparkline } from "@/components/ic/sparkline";
import { SkeletonRow } from "@/components/ic/skeleton";
import { UserMenu } from "@/components/ic/user-menu";
import type { Competitor } from "@/lib/ic-mock";
import { useAuthedUser } from "@/lib/use-authed-user";
import {
  useCompetitors,
  useCreateCompetitor,
  useDeleteCompetitor,
  useToggleCompetitorStatus,
  useTriggerCrawl,
} from "@/lib/data/hooks/use-competitors";
import { useAlerts, useUnreadAlertsCount } from "@/lib/data/hooks/use-alerts";
import { toastDataError } from "@/lib/data/error-toast";

export const Route = createFileRoute("/_authed/competitors/")({
  component: CompetitorsListPage,
});

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .max(80, "Nome muito longo")
    .default(""),
  url: z
    .string()
    .trim()
    .min(4, "URL inválida")
    .regex(/\.[a-z]{2,}/i, "URL inválida")
    .transform((v) => (v.startsWith("http") ? v : `https://${v}`)),
});

type CreateInputForm = z.input<typeof createSchema>;
type CreateInput = z.output<typeof createSchema>;

function CompetitorsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuthedUser();
  const [open, setOpen] = useState(false);
  const [errorView, setErrorView] = useState<Competitor | null>(null);
  const [busca, setBusca] = useState("");
  const competitorsQ = useCompetitors();
  const alertsQ = useAlerts();
  const naoLidos = useUnreadAlertsCount();
  const createMut = useCreateCompetitor();
  const deleteMut = useDeleteCompetitor();
  const toggleMut = useToggleCompetitorStatus();
  const crawlMut = useTriggerCrawl();

  const handleLogout = async () => {
    if (authed) await authed.logout();
    qc.clear();
    navigate({ to: "/login", replace: true });
  };

  const todos = competitorsQ.data ?? [];
  const termo = busca.trim().toLowerCase();
  const competitors = termo
    ? todos.filter(
        (c) =>
          c.name.toLowerCase().includes(termo) ||
          (c.domain ?? "").toLowerCase().includes(termo),
      )
    : todos;

  return (
    <>
      <AppTopbar
        title="Concorrentes"
        subtitle="Monitoramento"
        alertsCount={naoLidos}
        onSearchChange={setBusca}
        searchPlaceholder="Buscar por nome ou domínio…"
        trailing={
          authed ? (
            <UserMenu
              email={authed.email}
              fullName={authed.fullName}
              onLogout={handleLogout}
            />
          ) : null
        }
      />
      <div className="ic-content">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                color: "var(--via-color-text-muted)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {competitors.length} cadastrados
            </div>
          </div>
          <button
            type="button"
            className="ic-btn ic-btn-blue"
            onClick={() => setOpen(true)}
          >
            <Plus size={14} />
            Adicionar
          </button>
        </div>

        <div className="ic-card" style={{ padding: 0 }}>
          {competitorsQ.isLoading && (
            <>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonRow key={i} />
              ))}
            </>
          )}
          {!competitorsQ.isLoading && competitors.length === 0 && (
            <div className="ic-empty">
              <div className="ic-empty-icon">
                <Plus size={24} />
              </div>
              <div style={{ fontWeight: 700, color: "var(--via-navy)" }}>
                Sem concorrentes cadastrados
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Adicione um concorrente pra começar o monitoramento
              </div>
              <button
                type="button"
                className="ic-btn ic-btn-blue"
                style={{ marginTop: 14 }}
                onClick={() => setOpen(true)}
              >
                <Plus size={14} />
                Adicionar primeiro
              </button>
            </div>
          )}
          {competitors.map((c) => (
            <div
              key={c.id}
              className="ic-comp-row"
              onClick={() => navigate({ to: "/competitors/$id", params: { id: c.id } })}
            >
              <CompetitorFavicon comp={c} />
              <div style={{ flex: "1 1 0", minWidth: 0 }}>
                <div className="ic-comp-name">{c.name}</div>
                <div className="ic-comp-domain">
                  {c.domain} · {c.category}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 96 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: "var(--via-navy)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtTraffic(c.traffic)}
                </div>
                <div
                  className={cn(
                    "ic-kpi-delta",
                    c.trafficDelta > 0 ? "up" : "down",
                  )}
                  style={{ fontSize: 11 }}
                >
                  {fmtDelta(c.trafficDelta)}
                </div>
              </div>
              <Sparkline
                values={c.trafficSeries}
                color={c.color}
                width={70}
                height={26}
              />
              <div style={{ minWidth: 110 }}>
                <CrawlStatusBadge
                  competitor={c}
                  onShowError={() => setErrorView(c)}
                />
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--via-color-text-muted)",
                    marginTop: 4,
                    letterSpacing: "0.04em",
                  }}
                >
                  {c.lastChange}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                {/* Com texto, nao so o icone: `title` nao e rotulo -- o balao
                    leva cerca de um segundo para aparecer e nao existe em
                    toque. Este era o unico disparo de crawl na lista, e
                    ninguem o encontrava. */}
                <button
                  type="button"
                  className="ic-btn ic-btn-secondary"
                  style={{ whiteSpace: "nowrap" }}
                  disabled={crawlMut.isPending}
                  onClick={() =>
                    crawlMut.mutate(c.id, {
                      onSuccess: () =>
                        toast.success(`Crawl iniciado para ${c.name}`),
                      onError: (err) => toastDataError(err),
                    })
                  }
                >
                  <RefreshCw size={14} />
                  Crawlear agora
                </button>
                <button
                  type="button"
                  className="ic-iconbtn"
                  title={c.monitoring ? "Pausar" : "Retomar"}
                  onClick={() => toggleMut.mutate(c.id)}
                >
                  {c.monitoring ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button
                  type="button"
                  className="ic-iconbtn"
                  title="Excluir"
                  onClick={() => {
                    if (confirm(`Excluir "${c.name}"? Esta ação é irreversível.`)) {
                      deleteMut.mutate(c.id, {
                        onSuccess: () => toast.success("Removido"),
                      });
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <ChevronRight
                size={14}
                style={{ color: "var(--via-color-text-muted)" }}
              />
            </div>
          ))}
        </div>
      </div>

      {open && (
        <CreateDialog
          onClose={() => setOpen(false)}
          onSubmit={async (input) => {
            try {
              const novo = await createMut.mutateAsync({
                name: input.name ?? "",
                url: input.url,
              });
              console.log("[competitors.index] created", novo);
              toast.success("Concorrente adicionado");
              setOpen(false);
            } catch (err) {
              console.error("[competitors.index] create failed", err);
              toastDataError(err, "Falha ao cadastrar concorrente");
            }
          }}
          submitting={createMut.isPending}
        />
      )}

      {errorView && (
        <CrawlErrorDialog
          competitor={errorView}
          onClose={() => setErrorView(null)}
          onRetry={() => {
            crawlMut.mutate(errorView.id, {
              onSuccess: () => toast.success(`Crawl reiniciado: ${errorView.name}`),
              onError: (err) => toastDataError(err),
            });
            setErrorView(null);
          }}
        />
      )}
    </>
  );
}

function CrawlErrorDialog({
  competitor,
  onClose,
  onRetry,
}: {
  competitor: Competitor;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,22,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxWidth: "100%",
          background: "var(--via-color-bg-surface)",
          borderRadius: 14,
          padding: 28,
          boxShadow: "var(--via-shadow-raised)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span className="ic-pill high">Falha no crawl</span>
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: "var(--via-navy)",
            marginBottom: 6,
          }}
        >
          {competitor.name}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--via-color-text-muted)",
            marginBottom: 16,
          }}
        >
          {competitor.domain}
        </p>
        <div
          style={{
            background: "var(--via-danger-bg)",
            border: "1px solid rgba(182,58,47,0.18)",
            borderRadius: 8,
            padding: 14,
            fontSize: 13,
            color: "var(--via-danger)",
            fontFamily: "var(--via-font-mono)",
            lineHeight: 1.5,
            marginBottom: 22,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {competitor.crawlError ?? "Erro desconhecido."}
        </div>
        <div
          style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="ic-btn ic-btn-secondary"
            onClick={onClose}
          >
            Fechar
          </button>
          <button type="button" className="ic-btn ic-btn-blue" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateDialog({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (i: CreateInput) => Promise<void>;
  submitting: boolean;
}) {
  const form = useForm<CreateInputForm, unknown, CreateInput>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", url: "" },
  });
  const submit = form.handleSubmit(
    (input) => {
      console.log("[CreateDialog] valid submit", input);
      return onSubmit(input);
    },
    (errors) => {
      console.warn("[CreateDialog] validation errors", errors);
      const firstMsg =
        errors.url?.message ?? errors.name?.message ?? "Verifique os campos";
      toast.error(firstMsg);
    },
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,22,42,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          background: "var(--via-color-bg-surface)",
          borderRadius: 14,
          padding: 28,
          boxShadow: "var(--via-shadow-raised)",
        }}
      >
        <h2
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "var(--via-navy)",
            marginBottom: 6,
          }}
        >
          Adicionar concorrente
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--via-color-text-muted)",
            marginBottom: 22,
          }}
        >
          Cole a URL principal do concorrente. Vamos crawlear assim que salvar.
        </p>

        <div className="via-field" style={{ marginBottom: 14 }}>
          <label className="via-label-text" htmlFor="add-comp-url">
            URL *
          </label>
          <input
            id="add-comp-url"
            type="url"
            autoComplete="url"
            inputMode="url"
            className="via-input"
            placeholder="rdstation.com"
            aria-invalid={!!form.formState.errors.url}
            aria-describedby={
              form.formState.errors.url ? "add-comp-url-error" : undefined
            }
            {...form.register("url")}
          />
          {form.formState.errors.url && (
            <span
              id="add-comp-url-error"
              role="alert"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--via-danger)",
                marginTop: 6,
                background: "var(--via-danger-bg)",
                padding: "4px 8px",
                borderRadius: 4,
              }}
            >
              {form.formState.errors.url.message}
            </span>
          )}
        </div>

        <div className="via-field" style={{ marginBottom: 22 }}>
          <label className="via-label-text" htmlFor="add-comp-name">
            Nome (opcional)
          </label>
          <input
            id="add-comp-name"
            type="text"
            autoComplete="organization"
            className="via-input"
            placeholder="RD Station"
            {...form.register("name")}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="ic-btn ic-btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="ic-btn ic-btn-blue"
            disabled={submitting}
          >
            {submitting ? "Salvando…" : "Adicionar"}
          </button>
        </div>
      </form>
    </div>
  );
}
