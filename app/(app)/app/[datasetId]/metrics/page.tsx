"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
import { api } from "@/lib/api";
import { Button, ErrorState, Loading } from "@/components/ui/primitives";

interface MetricsDto {
  sessions: {
    total: number;
    completed_valid: number;
    interrupted: number;
    abandoned: number;
    average_active_seconds: number | null;
    median_active_seconds: number | null;
    denominator: number;
  };
  decisions: {
    accepted: number;
    rejected: number;
    deferred: number;
    acceptance_rate: number | null;
    denominator: number;
    pending_actionable: number;
    by_relation: Record<string, { accepted: number; rejected: number; deferred: number }>;
  };
  suggestions: Record<string, number>;
}

const fmtTime = (s: number | null) => {
  if (s === null) return "Sem observações";
  const m = Math.floor(s / 60);
  return `${m}min ${Math.round(s % 60)}s`;
};

/** Tela de métricas (doc 05 §9): null é "Sem observações", nunca zero; a
 * medida é tempo de VALIDAÇÃO — os 22 min do case são referência fictícia. */
export default function MetricsPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const [data, setData] = useState<MetricsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<MetricsDto>(`/datasets/${datasetId}/metrics`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
  }, [datasetId]);

  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Métricas</div>
          <h1 className="mt-2 text-[var(--text-2xl)] font-light">Experimento de validação</h1>
          <p className="mt-1 max-w-xl text-[var(--text-xs)] text-muted">
            Tempo de validação medido no servidor; modo manual vs assistido comparáveis só em tarefas equivalentes. A taxa de aceitação mede uso, não acurácia da IA.
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.open(`/api/v1/datasets/${datasetId}/metrics.csv`, "_blank")}>
          <Download className="size-3.5" aria-hidden /> Exportar CSV
        </Button>
      </header>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!data && !error ? <Loading /> : null}

      {data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section aria-label="Sessões" className="border border-line bg-panel">
            <header className="border-b border-line px-4 py-2"><span className="eyebrow">Sessões</span></header>
            <dl className="px-4 py-3 text-[var(--text-sm)]">
              <Row label="Sessões completas válidas" value={String(data.sessions.completed_valid)} hint={`denominador ${data.sessions.denominator}`} />
              <Row label="Tempo médio" value={fmtTime(data.sessions.average_active_seconds)} />
              <Row label="Mediana" value={fmtTime(data.sessions.median_active_seconds)} />
              <Row label="Interrompidas" value={String(data.sessions.interrupted)} hint="fora da amostra válida" />
              <Row label="Abandonadas" value={String(data.sessions.abandoned)} hint="fora da amostra válida" />
            </dl>
          </section>
          <section aria-label="Decisões" className="border border-line bg-panel">
            <header className="border-b border-line px-4 py-2"><span className="eyebrow">Decisões sobre sugestões</span></header>
            <dl className="px-4 py-3 text-[var(--text-sm)]">
              <Row label="Aceites" value={String(data.decisions.accepted)} />
              <Row label="Rejeições" value={String(data.decisions.rejected)} />
              <Row label="Adiadas" value={String(data.decisions.deferred)} hint="reportadas à parte" />
              <Row
                label="Taxa de aceitação"
                value={data.decisions.acceptance_rate === null ? "Sem observações" : `${(data.decisions.acceptance_rate * 100).toFixed(1)}%`}
                hint={`denominador ${data.decisions.denominator} (exclui inconclusivas/stale)`}
              />
              <Row label="Acionáveis pendentes" value={String(data.decisions.pending_actionable)} />
            </dl>
          </section>
          <section aria-label="Sugestões por estado" className="border border-line bg-panel md:col-span-2">
            <header className="border-b border-line px-4 py-2"><span className="eyebrow">Sugestões por estado</span></header>
            <dl className="px-4 py-3 text-[var(--text-sm)]">
              {Object.entries(data.suggestions).map(([k, v]) => (
                <Row key={k} label={k} value={String(v)} />
              ))}
              {Object.keys(data.suggestions).length === 0 ? <Row label="Nenhuma sugestão gerada" value="—" /> : null}
            </dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line2 py-1.5 last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="num text-right">
        {value}
        {hint ? <span className="mono ml-2 text-[var(--text-2xs)] text-faint">{hint}</span> : null}
      </dd>
    </div>
  );
}
