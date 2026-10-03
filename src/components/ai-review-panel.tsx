"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, Pause, Play, Square, X } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, ErrorState, Loading } from "@/components/ui/primitives";

interface SuggestionDto {
  id: string;
  field: string;
  relation: "confirmation" | "contradiction" | "fill" | "inconclusive";
  current_value: unknown;
  proposed_value: unknown;
  confidence: string | null;
  rationale: string | null;
  evidence: Array<{ signal_id: string; signal_version: number; quote: string; observed_on: string | null }>;
  state: string;
  version: number;
  can_accept: boolean;
  blocked_reason: string | null;
}

interface JobDto {
  job_id: string;
  state: string;
  processed: number;
  failed: number;
  skipped: number;
  requested: number;
}

const RELATION_LABEL: Record<SuggestionDto["relation"], string> = {
  confirmation: "Confirmação",
  contradiction: "Contradição",
  fill: "Preenchimento",
  inconclusive: "Inconclusiva",
};

const fmt = (v: unknown) => (v === null || v === undefined ? "não informado" : String(v));

/**
 * Painel "IA e revisão" do detalhe (doc 05 §5 + doc 06): análise por escopo
 * conforme o gate, cards com trecho literal, decisões com can_accept honesto
 * e cronometragem server-side (projeção visual, nunca fonte de verdade).
 */
export function AiReviewPanel({ datasetId, companyId, gateState, companyVersion, inputRevision, onChanged }: {
  datasetId: string;
  companyId: string;
  gateState: "in" | "out" | "pending";
  companyVersion: number;
  inputRevision: number;
  onChanged: () => void;
}) {
  const [job, setJob] = useState<JobDto | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSuggestions = useCallback(() => {
    api<SuggestionDto[]>(`/datasets/${datasetId}/suggestions?company_id=${companyId}`)
      .then((r) => setSuggestions(r.data))
      .catch((e) => setError(e.message));
  }, [datasetId, companyId]);

  useEffect(loadSuggestions, [loadSuggestions]);

  const analyze = useCallback(async (scope: "icp_gaps" | "eligible_enrichment") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<JobDto>(`/datasets/${datasetId}/analysis-jobs`, {
        method: "POST",
        body: { company_ids: [companyId], scope },
        idempotencyKey: `ui-${scope}-${companyId}-${Date.now()}`,
      });
      setJob(res.data);
      // Polling doc 03 §6: 2s, abortado ao desmontar.
      pollRef.current = setInterval(async () => {
        const r = await api<JobDto>(`/datasets/${datasetId}/analysis-jobs/${res.data.job_id}`).catch(() => null);
        if (!r) return;
        setJob(r.data);
        if (r.data.state !== "queued" && r.data.state !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
          loadSuggestions();
        }
      }, 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, datasetId, companyId, loadSuggestions]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function decide(s: SuggestionDto, action: "accept" | "reject" | "defer") {
    setBusy(true);
    setError(null);
    try {
      await api(`/datasets/${datasetId}/suggestions/${s.id}/decision`, {
        method: "POST",
        body: { action, expected_company_version: companyVersion, expected_suggestion_version: s.version },
        idempotencyKey: `ui-dec-${s.id}-${action}-${Date.now()}`,
      });
      setDecided(`${action}:${s.id}`);
      loadSuggestions();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
      loadSuggestions();
    } finally {
      setBusy(false);
    }
  }

  const scope = gateState === "pending" ? "icp_gaps" : gateState === "in" ? "eligible_enrichment" : null;

  return (
    <section aria-label="IA e revisão" className="border border-line bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="eyebrow">IA e revisão — o provedor é o fixture determinístico</span>
        <div className="flex items-center gap-2">
          {scope ? (
            <Button variant="secondary" onClick={() => analyze(scope)} disabled={busy}>
              {gateState === "pending" ? "Analisar lacunas do ICP" : "Analisar sinais"}
            </Button>
          ) : (
            <span className="text-[var(--text-2xs)] text-muted">Contas fora do ICP não recebem exploração automática.</span>
          )}
        </div>
      </header>
      <div className="px-4 py-2">
        {job ? (
          <p className="mono text-[var(--text-2xs)] text-muted" aria-live="polite">
            job {job.job_id.slice(0, 8)} · {job.state} · processadas {job.processed} · falhas {job.failed} · puladas {job.skipped} de {job.requested}
          </p>
        ) : null}
        {error ? <div className="mt-2"><ErrorState message={error} /></div> : null}
      </div>
      <div className="px-4 pb-4">
        {suggestions === null ? <Loading label="Sugestões…" /> : null}
        {suggestions && suggestions.length === 0 ? (
          <p className="text-[var(--text-sm)] text-muted">Nenhuma sugestão para esta conta — gere uma análise.</p>
        ) : null}
        <ul className="space-y-3">
          {(suggestions ?? []).map((s) => (
            <li key={s.id} className="border border-line2 bg-zebra px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={s.relation === "contradiction" ? "bad" : s.relation === "confirmation" ? "ok" : s.relation === "fill" ? "wait" : "neutral"}>
                    {RELATION_LABEL[s.relation]}
                  </Badge>
                  <span className="mono text-[var(--text-xs)]">{s.field}</span>
                  <span className="text-[var(--text-xs)] text-muted">
                    {fmt(s.current_value)} → <strong>{fmt(s.proposed_value)}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {s.state !== "pending" && s.state !== "deferred" ? (
                    <Badge tone={s.state === "accepted" ? "ok" : s.state === "rejected" ? "bad" : "broken"}>{s.state}</Badge>
                  ) : (
                    <>
                      <Button variant="ghost" disabled={busy} onClick={() => decide(s, "defer")} aria-label={`Adiar ${s.field}`}>Adiar</Button>
                      <Button variant="ghost" disabled={busy} onClick={() => decide(s, "reject")} aria-label={`Rejeitar ${s.field}`}><X className="size-3.5" aria-hidden /></Button>
                      <Button variant="primary" disabled={busy || !s.can_accept} onClick={() => decide(s, "accept")} aria-label={`Aceitar ${s.field}`}>
                        <Check className="size-3.5" aria-hidden /> Aceitar
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {s.blocked_reason && s.state === "pending" ? (
                <p className="mt-1 text-[var(--text-2xs)] text-broken-fg">Bloqueada: {s.blocked_reason === "inconclusive" ? "sugestão inconclusiva não oferece aceite" : s.blocked_reason === "evidence_changed" ? "a evidência mudou ou foi arquivada; reanalise" : s.blocked_reason}</p>
              ) : null}
              {s.rationale ? <p className="mt-1 text-[var(--text-xs)] text-muted">{s.rationale}</p> : null}
              {s.evidence.map((ev, i) => (
                <blockquote key={i} className="mt-1 border-l-2 border-[var(--color-ia)] pl-2 text-[var(--text-xs)] italic text-fg">
                  “{ev.quote}”
                  <span className="mono ml-2 not-italic text-faint">
                    sinal {ev.signal_id.slice(0, 8)} · v{ev.signal_version} · {ev.observed_on ?? "sem data"}
                  </span>
                </blockquote>
              ))}
              {decided === `accept:${s.id}` ? <p className="mt-1 text-[var(--text-2xs)] text-ok-fg">Aceite aplicado e recalculado.</p> : null}
            </li>
          ))}
        </ul>
      </div>
      <footer className="border-t border-line px-4 py-2">
        <ValidationTimer datasetId={datasetId} companyId={companyId} inputRevision={inputRevision} />
      </footer>
    </section>
  );
}

interface SessionDto {
  id: string;
  state: "active" | "paused" | "completed" | "abandoned";
  mode: "manual" | "assisted";
  version: number;
  active_seconds: number;
  started_at: string;
}

/** Cronômetro (doc 05 §9): projeção do servidor — pausa/conclui/abandona com
 * expected_version e, no complete, expected_input_revision atual. */
function ValidationTimer({ datasetId, companyId, inputRevision }: { datasetId: string; companyId: string; inputRevision: number }) {
  const [session, setSession] = useState<SessionDto | null>(null);
  const [mode, setMode] = useState<"manual" | "assisted">("assisted");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const projectedSeconds = session
    ? session.active_seconds + (session.state === "active" ? Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000) - session.active_seconds : 0)
    : 0;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<SessionDto>(`/datasets/${datasetId}/review-sessions`, {
        method: "POST",
        body: { company_id: companyId, mode },
        idempotencyKey: `ui-sess-${companyId}-${Date.now()}`,
      });
      setSession(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function ev(event: "pause" | "resume" | "complete" | "abandon", extra: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<SessionDto>(`/datasets/${datasetId}/review-sessions/${session.id}/events`, {
        method: "POST",
        body: { event, expected_version: session.version, ...extra },
        idempotencyKey: `ui-ev-${session.id}-${event}-${Date.now()}`,
      });
      setSession(res.data);
      if (event === "complete" || event === "abandon") setSession(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  void tick;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Clock className="size-3.5 text-muted" aria-hidden />
      {session ? (
        <>
          <span className="num mono text-[var(--text-sm)]" aria-live="off">
            {Math.floor(projectedSeconds / 60)}min {projectedSeconds % 60}s · {session.mode} · {session.state}
          </span>
          {session.state === "active" ? (
            <Button variant="ghost" disabled={busy} onClick={() => ev("pause")} aria-label="Pausar cronômetro"><Pause className="size-3.5" aria-hidden /> Pausar</Button>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => ev("resume")} aria-label="Retomar cronômetro"><Play className="size-3.5" aria-hidden /> Retomar</Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={() => ev("complete", { expected_input_revision: inputRevision })}>Concluir</Button>
          <Button variant="ghost" disabled={busy} onClick={() => ev("abandon")}><Square className="size-3.5" aria-hidden /> Abandonar</Button>
        </>
      ) : (
        <>
          <select
            aria-label="Modo da validação"
            value={mode}
            onChange={(e) => setMode(e.target.value as "manual" | "assisted")}
            className="h-7 border border-line bg-panel px-2 text-[var(--text-xs)]"
          >
            <option value="assisted">Assistido (com IA)</option>
            <option value="manual">Manual (sem IA)</option>
          </select>
          <Button variant="secondary" disabled={busy} onClick={start}>Iniciar validação</Button>
        </>
      )}
      {error ? <span className="text-[var(--text-2xs)] text-bad-fg">{error}</span> : null}
    </div>
  );
}
