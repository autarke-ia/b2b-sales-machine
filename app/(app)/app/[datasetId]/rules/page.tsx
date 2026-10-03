"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button, ErrorState, Loading, Select } from "@/components/ui/primitives";

interface RuleConfigDto {
  icp: { threshold: number; required_criteria: string[]; weights: Record<string, number> };
  priority: { weights: Record<string, number>; recent_signal_days: number; high_threshold: number; medium_threshold: number };
  disqualifiers: Record<string, Record<string, unknown> & { enabled?: boolean; min_employees?: number; penalty_points?: number }>;
  shared: Record<string, unknown>;
}

interface RulesetDto {
  id: string;
  status: string;
  config: RuleConfigDto;
  base_ruleset_id: string | null;
  published_at: string | null;
}

/** Tela de regras (doc 05 §7): três áreas, soma 100 por grupo visível, rascunho
 * completo → resumo → publicação com expected active. Sem ajuste proporcional
 * silencioso; RULESET_CONFLICT exige revisão. */
export default function RulesPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const [active, setActive] = useState<RulesetDto | null>(null);
  const [draft, setDraft] = useState<RuleConfigDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<RulesetDto>(`/datasets/${datasetId}/ruleset`)
      .then((res) => {
        setActive(res.data);
        setDraft(structuredClone(res.data.config)); // edição local até publicar
      })
      .catch((e) => setError(e.message));
  }, [datasetId]);

  useEffect(load, [load]);

  async function createDraft(config: RuleConfigDto): Promise<string> {
    const res = await api<RulesetDto>(`/datasets/${datasetId}/rulesets/drafts`, {
      method: "POST",
      body: { config },
      idempotencyKey: `draft-${active!.id}-${JSON.stringify(config).length}-${crypto.randomUUID().slice(0, 8)}`,
    });
    return res.data.id;
  }

  async function publish() {
    if (!draft || !active || busy) return;
    setBusy(true);
    setError(null);
    setPublished(false);
    try {
      // Rascunho criado AGORA com a config editada (a edição nunca fica só no
      // cliente) e publicado em seguida; o servidor compara a ativa esperada.
      const id = await createDraft(draft);
      await api(`/datasets/${datasetId}/rulesets/${id}/publish`, {
        method: "POST",
        body: { expected_active_ruleset_id: active.id },
        idempotencyKey: `pub-${id}-${active.id}`,
      });
      setDraft(null);
      setPublished(true);
      load();
    } catch (e) {
      setError((e as Error).message);
      if ((e as { code?: string }).code === "RULESET_CONFLICT") load(); // recupera ativa real
    } finally {
      setBusy(false);
    }
  }

  if (error && !active) return <ErrorState message={error} onRetry={load} />;
  if (!active) return <Loading />;

  const icpSum = draft ? Object.values(draft.icp.weights).reduce((a, b) => a + b, 0) : 0;
  const prioSum = draft ? Object.values(draft.priority.weights).reduce((a, b) => a + b, 0) : 0;

  const weightInput = (group: "icp" | "priority", key: string) => (
    <label className="flex items-center justify-between gap-3 py-1" key={key}>
      <span className="mono text-[var(--text-xs)] text-muted">{key}</span>
      <input
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={draft![group].weights[key]}
        aria-label={`Peso ${key}`}
        className="num h-7 w-24 border border-line bg-panel px-2 text-right text-[var(--text-sm)]"
        onChange={(e) => {
          const v = Number(e.target.value);
          setDraft({ ...draft!, [group]: { ...draft![group], weights: { ...draft![group].weights, [key]: v } } });
        }}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Regras</div>
          <h1 className="mt-2 text-[var(--text-2xl)] font-light">Gate ICP, priorização e desqualificadores</h1>
          <p className="mono mt-1 text-[var(--text-2xs)] text-faint">
            ativa {active.id.slice(0, 8)} · publicada {active.published_at ? new Date(active.published_at).toLocaleDateString("pt-BR") : "—"}
          </p>
        </div>
        {published ? <span className="text-[var(--text-xs)] text-ok-fg">Regra publicada — o ranking foi invalidado.</span> : null}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setDraft(structuredClone(active.config))} disabled={busy}>Descartar edições</Button>
          <Button variant="primary" onClick={publish} disabled={busy || icpSum !== 100 || prioSum !== 100}>
            {busy ? "Publicando…" : "Criar rascunho e publicar"}
          </Button>
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {draft ? (
        <>
          {icpSum !== 100 || prioSum !== 100 ? (
            <div className="border border-bad/30 bg-tint-bad px-3 py-2 text-[var(--text-xs)] text-bad-fg" role="alert">
              Pesos devem somar exatamente 100 por grupo — ICP: {icpSum.toFixed(2)} · Prioridade: {prioSum.toFixed(2)}. Nenhum ajuste proporcional é feito automaticamente.
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <section aria-label="Gate ICP" className="border border-line bg-panel">
              <header className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="eyebrow">Gate ICP</span>
                <span className={`mono text-[var(--text-2xs)] ${icpSum === 100 ? "text-ok-fg" : "text-bad-fg"}`}>Σ {icpSum.toFixed(2)}</span>
              </header>
              <div className="px-3 py-2">
                <label className="flex items-center justify-between py-1">
                  <span className="text-[var(--text-xs)] text-muted">Corte (aderência mínima)</span>
                  <input
                    type="number" min={0} max={100} value={draft.icp.threshold} aria-label="Corte do ICP"
                    className="num h-7 w-24 border border-line bg-panel px-2 text-right text-[var(--text-sm)]"
                    onChange={(e) => setDraft({ ...draft, icp: { ...draft.icp, threshold: Number(e.target.value) } })}
                  />
                </label>
                {Object.keys(draft.icp.weights).map((k) => weightInput("icp", k))}
              </div>
            </section>
            <section aria-label="Priorização" className="border border-line bg-panel">
              <header className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="eyebrow">Priorização</span>
                <span className={`mono text-[var(--text-2xs)] ${prioSum === 100 ? "text-ok-fg" : "text-bad-fg"}`}>Σ {prioSum.toFixed(2)}</span>
              </header>
              <div className="px-3 py-2">
                {Object.keys(draft.priority.weights).map((k) => weightInput("priority", k))}
              </div>
            </section>
            <section aria-label="Desqualificadores" className="border border-line bg-panel">
              <header className="border-b border-line px-3 py-2"><span className="eyebrow">Desqualificadores</span></header>
              <div className="px-3 py-2">
                {Object.entries(draft.disqualifiers).map(([id, cfg]) => (
                  <div key={id} className="flex items-center justify-between py-1">
                    <span className="mono text-[var(--text-xs)] text-muted">{id}</span>
                    {id === "D03" ? (
                      <span className="text-[var(--text-2xs)] text-faint">sempre ativo</span>
                    ) : (
                      <Select
                        value={String(cfg.enabled)}
                        aria-label={`Estado ${id}`}
                        onChange={(e) => setDraft({ ...draft, disqualifiers: { ...draft.disqualifiers, [id]: { ...cfg, enabled: e.target.value === "true" } } })}
                      >
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RulesetView({ config }: { config: RuleConfigDto }) {
  const icpSum = Object.values(config.icp.weights).reduce((a, b) => a + b, 0);
  const prioSum = Object.values(config.priority.weights).reduce((a, b) => a + b, 0);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section aria-label="Gate ICP vigente" className="border border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="eyebrow">Gate ICP</span>
          <span className="mono text-[var(--text-2xs)] text-muted">corte {config.icp.threshold}</span>
        </header>
        <ul className="px-3 py-2">
          {Object.entries(config.icp.weights).map(([k, w]) => (
            <li key={k} className="flex justify-between py-0.5 text-[var(--text-xs)]">
              <span className="mono text-muted">{k}</span>
              <span className="num">{w}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-line2 pt-1 text-[var(--text-xs)]">
            <span className="text-muted">Σ</span><span className={`num ${icpSum === 100 ? "text-ok-fg" : "text-bad-fg"}`}>{icpSum}</span>
          </li>
        </ul>
      </section>
      <section aria-label="Priorização vigente" className="border border-line bg-panel">
        <header className="border-b border-line px-3 py-2"><span className="eyebrow">Priorização</span></header>
        <ul className="px-3 py-2">
          {Object.entries(config.priority.weights).map(([k, w]) => (
            <li key={k} className="flex justify-between py-0.5 text-[var(--text-xs)]">
              <span className="mono text-muted">{k}</span><span className="num">{w}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-line2 pt-1 text-[var(--text-xs)]">
            <span className="text-muted">Σ</span><span className={`num ${prioSum === 100 ? "text-ok-fg" : "text-bad-fg"}`}>{prioSum}</span>
          </li>
        </ul>
      </section>
      <section aria-label="Desqualificadores vigentes" className="border border-line bg-panel">
        <header className="border-b border-line px-3 py-2"><span className="eyebrow">Desqualificadores</span></header>
        <ul className="px-3 py-2">
          {Object.entries(config.disqualifiers).map(([id, cfg]) => (
            <li key={id} className="flex justify-between py-0.5 text-[var(--text-xs)]">
              <span className="mono text-muted">{id}</span>
              <span>{id === "D03" ? "sempre ativo" : cfg.enabled ? "Ativo" : "Inativo"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
