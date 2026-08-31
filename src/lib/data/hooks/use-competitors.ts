import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { data } from "../index";
import type { CreateCompetitorInput } from "../types";
import type { Competitor } from "@/lib/ic-mock";

const KEYS = {
  all: ["competitors"] as const,
  one: (id: string) => ["competitors", id] as const,
};

const POLL_INTERVAL_MS = 4000;

function hasActiveJob(list: Competitor[] | undefined): boolean {
  if (!list) return false;
  return list.some(
    (c) => c.crawlStatus === "queued" || c.crawlStatus === "running",
  );
}

export function useCompetitors() {
  const q = useQuery({
    queryKey: KEYS.all,
    queryFn: () => data.listCompetitors(),
    refetchInterval: (query) =>
      hasActiveJob(query.state.data as Competitor[] | undefined)
        ? POLL_INTERVAL_MS
        : false,
    refetchIntervalInBackground: false,
  });

  // Detecta transição running/queued → success/failed e dispara toast
  const prevStatusRef = useRef<Map<string, Competitor["crawlStatus"]>>(new Map());
  useEffect(() => {
    if (!q.data) return;
    const prev = prevStatusRef.current;
    const next = new Map<string, Competitor["crawlStatus"]>();
    for (const c of q.data) {
      const before = prev.get(c.id);
      const now = c.crawlStatus;
      next.set(c.id, now);
      const wasActive = before === "queued" || before === "running";
      if (wasActive && now === "success") {
        toast.success(`${c.name} crawleado com sucesso`);
      } else if (wasActive && now === "failed") {
        toast.error(`${c.name}: ${c.crawlError ?? "Falha no crawl"}`);
      }
    }
    prevStatusRef.current = next;
  }, [q.data]);

  return q;
}

export function useCompetitor(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.one(id) : ["competitors", "noop"],
    queryFn: () => (id ? data.getCompetitor(id) : Promise.resolve(null)),
    enabled: !!id,
    refetchInterval: (query) => {
      const c = query.state.data as Competitor | null | undefined;
      return c && (c.crawlStatus === "queued" || c.crawlStatus === "running")
        ? POLL_INTERVAL_MS
        : false;
    },
    refetchIntervalInBackground: false,
  });
}

export function useCreateCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCompetitorInput) => data.createCompetitor(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
    onError: (err) => {
      console.error("[useCreateCompetitor] mutation error", err);
    },
  });
}

export function useToggleCompetitorStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.toggleCompetitorStatus(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.one(id) });
    },
  });
}

export function useDeleteCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.deleteCompetitor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useTriggerCrawl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.triggerCrawl(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.one(id) });
    },
  });
}
