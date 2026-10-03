"use client";

import { GateBadge, BandBadge, StatusBadge, FactorText } from "./badges";

export interface Criterion {
  id: string;
  factor: number | null;
  weight: number;
  points: number;
  missing: boolean;
  reason_code: string;
  input_fields: string[];
}

export interface AssessmentView {
  gate: {
    state: "in" | "out" | "pending";
    score_min: number;
    score_max: number;
    threshold: number;
    hard_failures: string[];
    unknown_requirements: string[];
    criteria: Criterion[];
  };
  priority: {
    score: number;
    score_min: number;
    score_max: number;
    band: "high" | "medium" | "low";
    status: "preliminary" | "reviewed";
    criteria: Criterion[];
    applied_penalty: number;
    possible_penalty: number;
    known_weight: number;
    warnings: string[];
  } | null;
}

/** Decomposição gate × prioridade (doc 05 §5): as duas notas NUNCA somadas. */
export function Decomposition({ assessment }: { assessment: AssessmentView }) {
  const g = assessment.gate;
  const p = assessment.priority;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section aria-label="Gate ICP" className="border border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-3 py-2">
          <GateBadge state={g.state} />
          <span className="mono text-[var(--text-2xs)] text-muted">
            aderência {g.score_min}–{g.score_max} · corte {g.threshold}
          </span>
        </header>
        <div className="px-3 py-2">
          {g.hard_failures.length ? <p className="text-[var(--text-2xs)] text-bad-fg">Impedimentos: {g.hard_failures.join(", ")}</p> : null}
          {g.unknown_requirements.length ? <p className="text-[var(--text-2xs)] text-wait-fg">Requisitos desconhecidos: {g.unknown_requirements.join(", ")}</p> : null}
        </div>
        <CriteriaTable criteria={g.criteria} />
      </section>
      {p ? (
        <section aria-label="Score de prioridade" className="border border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-3 py-2">
            <BandBadge band={p.band} />
            <span className="mono text-[var(--text-2xs)] text-muted">
              {p.score.toFixed(2).replace(".", ",")} · intervalo {p.score_min.toFixed(0)}–{p.score_max.toFixed(0)} · peso conhecido {p.known_weight}
            </span>
          </header>
          <div className="px-3 py-2">
            {p.applied_penalty ? <p className="text-[var(--text-2xs)] text-bad-fg">Penalidade D05 aplicada: −{p.applied_penalty}</p> : null}
            {p.possible_penalty ? <p className="text-[var(--text-2xs)] text-broken-fg">D05 desconhecido: −{p.possible_penalty} possível no piso</p> : null}
            {p.warnings.length ? <p className="text-[var(--text-2xs)] text-broken-fg">{p.warnings.join(" · ")}</p> : null}
          </div>
          <CriteriaTable criteria={p.criteria} />
          <footer className="border-t border-line px-3 py-1.5">
            <StatusBadge status={p.status} />
          </footer>
        </section>
      ) : (
        <section aria-label="Prioridade ausente" className="flex items-center justify-center border border-line bg-panel px-4 py-10 text-center text-[var(--text-sm)] text-muted">
          Não participa do ranking — prioridade é calculada somente para empresas dentro do ICP.
        </section>
      )}
    </div>
  );
}

function CriteriaTable({ criteria }: { criteria: Criterion[] }) {
  return (
    <table className="w-full">
      <tbody>
        {criteria.map((c) => (
          <tr key={c.id} className="border-t border-line2">
            <td className="mono px-3 py-1 text-[var(--text-xs)] text-muted">{c.id}</td>
            <td className="px-2 py-1"><FactorText factor={c.factor} /></td>
            <td className="num px-1 py-1 text-[var(--text-xs)] text-muted">×</td>
            <td className="num px-1 py-1 text-[var(--text-xs)] text-muted">{c.weight}</td>
            <td className="num px-3 py-1 text-right text-[var(--text-xs)]">= {c.points.toFixed(2).replace(".", ",")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
