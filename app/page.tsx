import { ArrowRight, Building2, ShieldCheck, Sparkles } from "lucide-react";

/**
 * Placeholder da Fase 0 — valida os design tokens Autarkeia (sidebar ink, hairlines,
 * eyebrow, semânticos) sem depender de backend. É substituído pela jornada real na Fase 1.
 */
const amostras = [
  { nome: "Construtora Paineira Ltda.", id: "EMP-0007", estado: "Dentro do ICP", cor: "text-[var(--color-ok-fg)] bg-[var(--tint-ok)]", score: "87.5" },
  { nome: "TechRA Distribuição S.A.", id: "EMP-0042", estado: "Pendente", cor: "text-[var(--color-wait-fg)] bg-[var(--tint-wait)]", score: "—" },
  { nome: "Metalúrgica Horizonte", id: "EMP-0113", estado: "Fora do ICP", cor: "text-[var(--color-bad-fg)] bg-[var(--tint-bad)]", score: "—" },
];

export default function Placeholder() {
  return (
    <div className="flex min-h-screen">
      <aside className="on-ink w-60 shrink-0 border-r border-[var(--color-ink-line)] p-4">
        <div className="eyebrow">Autarkeia</div>
        <p className="mt-2 text-[var(--text-xs)] text-[var(--color-muted)]">
          B2B Sales Machine
        </p>
        <nav className="mt-6 space-y-1 text-[var(--text-sm)]">
          <div className="interactive rounded-none px-2 py-1.5">Ranking</div>
          <div className="interactive rounded-none px-2 py-1.5">Empresas</div>
          <div className="interactive rounded-none px-2 py-1.5">Regras</div>
          <div className="interactive rounded-none px-2 py-1.5">Métricas</div>
        </nav>
      </aside>

      <main className="flex-1 p-8">
        <div className="eyebrow">Fase 0 · Fundação</div>
        <h1 className="mt-3 text-[var(--text-2xl)] font-light tracking-tight">
          Protótipo v1 — B2B Sales Machine
        </h1>
        <p className="mt-2 max-w-xl text-[var(--color-muted)]">
          Tokens da marca carregados, API v1 no ar e motor determinístico em{" "}
          <code className="mono text-[var(--text-xs)]">src/domain/scoring</code>. As telas
          reais chegam na Fase 1.
        </p>

        <div className="mt-6 max-w-2xl border border-[var(--color-line)] bg-[var(--color-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5">
            <span className="eyebrow">Amostra de estados</span>
            <span className="mono text-[var(--text-2xs)] text-[var(--color-faint)]">
              dados fictícios
            </span>
          </div>
          <table className="w-full">
            <tbody>
              {amostras.map((a) => (
                <tr key={a.id} className="interactive border-b border-[var(--color-line2)] last:border-b-0">
                  <td className="px-4 py-2.5">
                    <Building2 className="mr-2 inline size-4 text-[var(--color-faint)]" />
                    {a.nome}
                  </td>
                  <td className="mono px-2 py-2.5 text-[var(--text-xs)] text-[var(--color-muted)]">{a.id}</td>
                  <td className="px-2 py-2.5">
                    <span className={`px-2 py-0.5 text-[var(--text-2xs)] ${a.cor}`}>{a.estado}</span>
                  </td>
                  <td className="num px-4 py-2.5 text-right">{a.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex gap-3 text-[var(--text-xs)] text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-[var(--color-ia)]" /> ICP determinístico
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-4 text-[var(--color-ia)]" /> IA interpreta evidências
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowRight className="size-4 text-[var(--color-ia)]" /> Rastreabilidade append-only
          </span>
        </div>
      </main>
    </div>
  );
}
