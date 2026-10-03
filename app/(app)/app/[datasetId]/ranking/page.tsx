"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Download } from "lucide-react";
import { api, apiPagination, downloadCsv } from "@/lib/api";
import { Button, EmptyState, ErrorState, Input, Loading, Select } from "@/components/ui/primitives";
import { BandBadge, FactorText, GateBadge, StatusBadge } from "@/components/badges";
import { Pager } from "@/components/pager";

interface Criterion {
  id: string;
  factor: number | null;
  weight: number;
  points: number;
  missing: boolean;
  reason_code: string;
  input_fields: string[];
}

interface Assessment {
  gate: { state: "in" | "out" | "pending"; score_min: number; score_max: number; threshold: number; hard_failures: string[]; unknown_requirements: string[]; criteria: Criterion[] };
  priority: { score: number; score_min: number; score_max: number; band: "high" | "medium" | "low"; status: "preliminary" | "reviewed"; criteria: Criterion[]; applied_penalty: number; possible_penalty: number; known_weight: number; warnings: string[] } | null;
}

interface RankRow {
  rank: number;
  company_id: string;
  external_id: string;
  name: string;
  segment: string | null;
  uf: string | null;
  employees: number | null;
  assessment: Assessment;
  has_public_channel: boolean;
  has_decision_maker: boolean;
  pending_suggestions: number;
}

interface RankState {
  rows: RankRow[];
  total: number;
  page: number;
  total_pages: number;
  snapshotId: string;
  asOf: string;
  isStale: boolean;
  datasetRevision: number;
  currentRevision: number;
}

/** Ranking (doc 05 §4): somente empresas 'in'; posição original preservada sob
 * filtros; export usa EXATAMENTE o snapshot exibido. A nota de ICP não aparece
 * como score — decomposição separa gate de prioridade. */
export default function RankingPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const [state, setState] = useState<RankState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [band, setBand] = useState("");
  const [decisor, setDecisor] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), page_size: "25" });
    if (state?.snapshotId) p.set("snapshot_id", state.snapshotId);
    if (q) p.set("q", q);
    if (band) p.set("band", band);
    if (decisor) p.set("decisor", decisor);
    return p.toString();
  }, [page, q, band, decisor, state?.snapshotId]);

  const load = useCallback(
    (keepSnapshot: boolean) => {
      setError(null);
      const p = new URLSearchParams(params);
      if (!keepSnapshot) p.delete("snapshot_id");
      api<RankRow[]>(`/datasets/${datasetId}/ranking?${p.toString()}`)
        .then((res) => {
          setState({
            rows: res.data,
            ...apiPagination(res),
            snapshotId: res.meta.snapshot_id as string,
            asOf: res.meta.as_of as string,
            isStale: res.meta.is_stale as boolean,
            datasetRevision: res.meta.dataset_revision as number,
            currentRevision: res.meta.current_dataset_revision as number,
          });
        })
        .catch((e) => setError(e.message));
    },
    [datasetId, params],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  function refresh() {
    setRefreshing(true);
    setState(null);
    load(false);
    setRefreshing(false);
  }

  const [exportError, setExportError] = useState<string | null>(null);

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (band) p.set("band", band);
    if (decisor) p.set("decisor", decisor);
    return p.toString();
  }, [q, band, decisor]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Priorização</div>
          <h1 className="mt-2 text-[var(--text-2xl)] font-light">Ranking — empresas dentro do ICP</h1>
        </div>
        <div className="flex items-center gap-2">
          {state ? (
            <span className="mono text-[var(--text-2xs)] text-faint">
              as_of {state.asOf} · snapshot {state.snapshotId.slice(0, 8)} · {state.total} contas
            </span>
          ) : null}
          <Button variant="secondary" disabled={refreshing} onClick={refresh}>Atualizar ranking</Button>
          <Button
            variant="secondary"
            disabled={!state || state.isStale}
            onClick={async () => {
              if (!state) return;
              setExportError(null);
              try {
                await downloadCsv(datasetId, state.snapshotId, filterQuery ? `&${filterQuery}` : "");
              } catch (e) {
                setExportError((e as Error).message);
              }
            }}
          >
            <Download className="size-3.5" aria-hidden /> Exportar CSV
          </Button>
        </div>
      </div>

      {exportError ? (
        <div className="mt-3 border border-bad/30 bg-tint-bad px-3 py-2 text-[var(--text-xs)] text-bad-fg" role="alert">
          Falha ao exportar: {exportError}
        </div>
      ) : null}

      {state?.isStale ? (
        <div className="mt-3 border border-broken/30 bg-tint-broken px-3 py-2 text-[var(--text-xs)] text-broken-fg" role="status">
          O snapshot envelheceu (dados ou regras mudaram — rev {state.datasetRevision} → {state.currentRevision}). Atualize o ranking para recomputar; este permanece consultável.
        </div>
      ) : null}

      <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); }}>
        <Input className="max-w-xs" placeholder="Buscar nome ou ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <Select value={band} onChange={(e) => { setBand(e.target.value); setPage(1); }} aria-label="Faixa">
          <option value="">Faixa: todas</option>
          <option value="high">Alta</option>
          <option value="medium">Média</option>
          <option value="low">Baixa</option>
        </Select>
        <Select value={decisor} onChange={(e) => { setDecisor(e.target.value); setPage(1); }} aria-label="Decisor">
          <option value="">Decisor: qualquer</option>
          <option value="true">Identificado</option>
          <option value="false">Não identificado</option>
        </Select>
      </form>

      {error ? <div className="mt-4"><ErrorState message={error} onRetry={() => load(true)} /></div> : null}
      {!state && !error ? <Loading /> : null}
      {state && state.rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nenhuma empresa dentro do ICP com estes filtros"
            hint="O ranking contém somente contas elegíveis. Veja pendências e excluídas na lista de Empresas."
          />
        </div>
      ) : null}

      {state && state.rows.length > 0 ? (
        <>
          <div className="mt-4 overflow-x-auto border border-line bg-panel">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-[var(--text-2xs)] uppercase tracking-wide text-muted">
                  <th className="w-6 px-2 py-2" aria-label="Expandir" />
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Empresa</th>
                  <th className="px-2 py-2 font-medium">Segmento</th>
                  <th className="px-2 py-2 font-medium">UF</th>
                  <th className="px-2 py-2 text-right font-medium">Colab.</th>
                  <th className="px-2 py-2 text-right font-medium">Score</th>
                  <th className="px-2 py-2 text-center font-medium">Faixa</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <Fragment key={r.company_id}>
                    <tr className="interactive border-b border-line2">
                      <td className="px-2 py-2">
                        <Button variant="ghost" className="px-1 py-0" aria-expanded={expanded === r.company_id} aria-label={`Decomposição de ${r.name}`} onClick={() => setExpanded(expanded === r.company_id ? null : r.company_id)}>
                          <ChevronRight className={`size-3.5 transition-transform ${expanded === r.company_id ? "rotate-90" : ""}`} aria-hidden />
                        </Button>
                      </td>
                      <td className="num px-2 py-2 text-[var(--text-sm)] text-muted">{r.rank}</td>
                      <td className="px-2 py-2">
                        <Link href={`/app/${datasetId}/companies/${r.company_id}`} className="hover:underline">{r.name}</Link>
                        {r.pending_suggestions > 0 ? <span className="ml-2 text-[var(--text-2xs)] text-wait-fg">{r.pending_suggestions} pend.</span> : null}
                      </td>
                      <td className="px-2 py-2 text-[var(--text-sm)] text-muted">{r.segment ?? "—"}</td>
                      <td className="px-2 py-2 text-[var(--text-sm)]">{r.uf ?? "—"}</td>
                      <td className="num px-2 py-2 text-right text-[var(--text-sm)]">{r.employees ?? "—"}</td>
                      <td className="num px-2 py-2 text-right text-[var(--text-sm)]">
                        {r.assessment.priority?.score.toFixed(2).replace(".", ",")}
                        {r.assessment.priority && r.assessment.priority.score_min !== r.assessment.priority.score_max ? (
                          <span className="block text-[var(--text-2xs)] text-faint">
                            {r.assessment.priority.score_min.toFixed(0)}–{r.assessment.priority.score_max.toFixed(0)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-center">{r.assessment.priority ? <BandBadge band={r.assessment.priority.band} /> : null}</td>
                      <td className="px-2 py-2"><StatusBadge status={r.assessment.priority?.status ?? "preliminary"} /></td>
                    </tr>
                    {expanded === r.company_id ? (
                      <tr className="border-b border-line2 bg-zebra">
                        <td />
                        <td colSpan={8} className="px-3 py-3">
                          <Decomposition assessment={r.assessment} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={state.page} totalPages={state.total_pages} onPage={setPage} />
        </>
      ) : null}
    </div>
  );
}

function Decomposition({ assessment }: { assessment: Assessment }) {
  const g = assessment.gate;
  const p = assessment.priority;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label="Gate ICP">
        <div className="flex items-center gap-2">
          <GateBadge state={g.state} />
          <span className="mono text-[var(--text-2xs)] text-muted">
            aderência {g.score_min}–{g.score_max} · corte {g.threshold}
          </span>
        </div>
        {g.hard_failures.length ? <p className="mt-1 text-[var(--text-2xs)] text-bad-fg">Impedimentos: {g.hard_failures.join(", ")}</p> : null}
        {g.unknown_requirements.length ? <p className="mt-1 text-[var(--text-2xs)] text-wait-fg">Requisitos desconhecidos: {g.unknown_requirements.join(", ")}</p> : null}
        <table className="mt-2 w-full">
          <tbody>
            {g.criteria.map((c) => <CriterionRow key={c.id} c={c} />)}
          </tbody>
        </table>
      </section>
      {p ? (
        <section aria-label="Score de prioridade">
          <p className="mono text-[var(--text-2xs)] text-muted">
            prioridade {p.score.toFixed(2).replace(".", ",")} · intervalo {p.score_min.toFixed(0)}–{p.score_max.toFixed(0)} · peso conhecido {p.known_weight}
            {p.applied_penalty ? <span className="text-bad-fg"> · penalidade D05 −{p.applied_penalty}</span> : null}
          </p>
          {p.warnings.length ? <p className="mt-1 text-[var(--text-2xs)] text-broken-fg">{p.warnings.join(" · ")}</p> : null}
          <table className="mt-2 w-full">
            <tbody>
              {p.criteria.map((c) => <CriterionRow key={c.id} c={c} />)}
            </tbody>
          </table>
        </section>
      ) : (
        <section aria-label="Prioridade ausente" className="text-[var(--text-sm)] text-muted">
          Não participa do ranking — prioridade é calculada somente para empresas dentro do ICP.
        </section>
      )}
    </div>
  );
}

function CriterionRow({ c }: { c: Criterion }) {
  return (
    <tr className="border-b border-line2 last:border-b-0">
      <td className="mono px-2 py-1 text-[var(--text-xs)] text-muted">{c.id}</td>
      <td className="px-2 py-1"><FactorText factor={c.factor} /></td>
      <td className="num px-2 py-1 text-[var(--text-xs)] text-muted">×</td>
      <td className="num px-2 py-1 text-[var(--text-xs)] text-muted">{c.weight}</td>
      <td className="num px-2 py-1 text-right text-[var(--text-xs)]">= {c.points.toFixed(2).replace(".", ",")}</td>
    </tr>
  );
}
